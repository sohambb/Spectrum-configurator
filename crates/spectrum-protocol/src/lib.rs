//! The Cosmic Byte Spectrum's settings protocol and the guarded write path.
//!
//! The mouse keeps its settings in one 885-byte flash image. A write rewrites the whole
//! image as 1117 feature-report packets (report 0x07, command 0x18), starting from the
//! factory image in `factory_image.json` and changing only the bytes for the polling rate,
//! DPI stages and lighting. Every write checks the mouse's status before and after.

use std::collections::BTreeMap;
use std::thread;
use std::time::Duration;

use std::sync::{Mutex, TryLockError};

/// The one HidApi for the whole app. It also serialises every HID conversation, so a status
/// read can never land in the middle of a write. It lists only this mouse's interfaces,
/// which is much cheaper than listing every HID device on the PC.
static HID_API: Mutex<Option<hidapi::HidApi>> = Mutex::new(None);

/// Runs `f` with the shared HidApi, refreshed to this mouse's current interfaces.
/// `wait = false` returns Err("busy") instead of waiting while a write or another call runs.
pub fn with_hid<R>(wait: bool, f: impl FnOnce(&hidapi::HidApi) -> Result<R, String>) -> Result<R, String> {
    let mut guard = if wait {
        HID_API.lock().unwrap_or_else(|e| e.into_inner())
    } else {
        match HID_API.try_lock() {
            Ok(g) => g,
            Err(TryLockError::Poisoned(e)) => e.into_inner(),
            Err(TryLockError::WouldBlock) => return Err("busy".to_string()),
        }
    };
    if guard.is_none() {
        *guard = Some(hidapi::HidApi::new().map_err(|e| format!("HidApi init failed: {}", e))?);
    }
    let api = guard.as_mut().expect("HidApi was just created");
    api.reset_devices().map_err(|e| format!("HID refresh failed: {}", e))?;
    api.add_devices(TARGET_VID, TARGET_PID).map_err(|e| format!("HID refresh failed: {}", e))?;
    f(api)
}

pub const TARGET_VID: u16 = 0x30FA;
pub const TARGET_PID: u16 = 0x1440;
pub const TARGET_USAGE_PAGE: u16 = 0xFF01;
pub const TARGET_COLLECTION_SUBSTRING: &str = "col04";
pub const EXPECTED_PACKET_LEN: usize = 8;
pub const EXPECTED_REPORT_ID: u8 = 0x07;
pub const EXPECTED_CMD_ID: u8 = 0x18;
pub const MAX_OBSERVED_ADDR: u16 = 0x04C7;

pub trait DeviceDescriptor {
    fn vendor_id(&self) -> u16;
    fn product_id(&self) -> u16;
    fn usage_page(&self) -> u16;
    fn path_str(&self) -> String;
}

impl DeviceDescriptor for hidapi::DeviceInfo {
    fn vendor_id(&self) -> u16 {
        self.vendor_id()
    }
    fn product_id(&self) -> u16 {
        self.product_id()
    }
    fn usage_page(&self) -> u16 {
        self.usage_page()
    }
    fn path_str(&self) -> String {
        self.path().to_string_lossy().to_string()
    }
}

impl<'a, D: DeviceDescriptor> DeviceDescriptor for &'a D {
    fn vendor_id(&self) -> u16 {
        (*self).vendor_id()
    }
    fn product_id(&self) -> u16 {
        (*self).product_id()
    }
    fn usage_page(&self) -> u16 {
        (*self).usage_page()
    }
    fn path_str(&self) -> String {
        (*self).path_str()
    }
}

#[derive(Debug, Clone)]
pub struct MockDeviceDescriptor {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub path: String,
}

impl DeviceDescriptor for MockDeviceDescriptor {
    fn vendor_id(&self) -> u16 {
        self.vendor_id
    }
    fn product_id(&self) -> u16 {
        self.product_id
    }
    fn usage_page(&self) -> u16 {
        self.usage_page
    }
    fn path_str(&self) -> String {
        self.path.clone()
    }
}

pub fn is_target_spectrum_device<D: DeviceDescriptor>(device: &D) -> bool {
    device.vendor_id() == TARGET_VID
        && device.product_id() == TARGET_PID
        && device.usage_page() == TARGET_USAGE_PAGE
        && device.path_str().to_lowercase().contains(TARGET_COLLECTION_SUBSTRING)
}

/// Resolves the authenticated target device path:
/// Rust finds the target device itself from the enumerated device list (VID 0x30FA, PID 0x1440, UsagePage 0xFF01, col04).
/// If `requested_path` is provided, it is strictly validated against the target device:
/// any differing or invalid path is rejected to guarantee writes cannot be redirected.
pub fn resolve_target_device_path<D: DeviceDescriptor>(
    devices: &[D],
    requested_path: Option<&str>,
) -> Result<String, String> {
    // 1. Rust finds the authentic target device itself
    let target = devices
        .iter()
        .find(|d| is_target_spectrum_device(*d))
        .ok_or_else(|| {
            format!(
                "Cosmic Byte Spectrum target endpoint not found (required: VID 0x{:04X}, PID 0x{:04X}, UsagePage 0x{:04X}, collection '{}')",
                TARGET_VID, TARGET_PID, TARGET_USAGE_PAGE, TARGET_COLLECTION_SUBSTRING
            )
        })?;

    let target_path = target.path_str();

    // 2. Validate requested path if provided
    if let Some(req) = requested_path {
        let req_clean = req.trim();
        if !req_clean.is_empty() {
            if !req_clean.eq_ignore_ascii_case(&target_path) {
                return Err(format!(
                    "Security rejection: Device path '{}' does not match verified Spectrum Col04 endpoint '{}'. Writes cannot be redirected.",
                    req_clean, target_path
                ));
            }
        }
    }

    Ok(target_path)
}

/// The mouse's factory settings image: flash address -> byte.
pub const FACTORY_IMAGE_JSON: &str = include_str!("../factory_image.json");

/// Extracts bytes 1..8 from a raw HID report buffer where buf[0] is the report ID (0x07).
/// Returns an 8-byte slice &[u8] representing data payload bytes 1..8.
pub fn bytes_1_to_8(buf: &[u8]) -> Result<&[u8], String> {
    if buf.is_empty() {
        return Err("Buffer is empty (missing report ID at buf[0])".to_string());
    }
    if buf[0] != EXPECTED_REPORT_ID {
        return Err(format!(
            "Invalid report ID 0x{:02X} at buf[0] (expected 0x{:02X})",
            buf[0], EXPECTED_REPORT_ID
        ));
    }
    if buf.len() < 9 {
        return Err(format!(
            "Buffer length {} too short for bytes 1..8 (expected >= 9 bytes: 1 report ID + 8 data bytes)",
            buf.len()
        ));
    }
    Ok(&buf[1..9])
}

pub fn hex_str(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" ")
}

/// Checks a status read (bytes 1..8) against the known layout. Empty = OK.
pub fn status_problems(b: &[u8], allowed_b6: &[u8]) -> Vec<String> {
    let mut p = Vec::new();
    if b.len() != 8 {
        p.push(format!("length {} != 8", b.len()));
        return p;
    }
    for (idx, want) in [(0usize, 0x00u8), (1, 0x68), (2, 0x09), (4, 0x00)] {
        if b[idx] != want {
            p.push(format!("byte[{}] (0x{:02X} != 0x{:02X})", idx + 1, b[idx], want));
        }
    }
    if !allowed_b6.contains(&b[5]) {
        let list: Vec<String> = allowed_b6.iter().map(|v| format!("0x{:02X}", v)).collect();
        p.push(format!("byte[6] (0x{:02X} not in [{}])", b[5], list.join(", ")));
    }
    if b[6] & 0x0F != 0x0B {
        p.push(format!("byte[7] (0x{:02X} low nibble != 0xB)", b[6]));
    }
    p
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PollingRate {
    Hz1000 = 1000,
    Hz500 = 500,
    Hz250 = 250,
    Hz125 = 125,
}

impl PollingRate {
    pub fn from_hz(hz: u32) -> Result<Self, String> {
        match hz {
            1000 => Ok(PollingRate::Hz1000),
            500 => Ok(PollingRate::Hz500),
            250 => Ok(PollingRate::Hz250),
            125 => Ok(PollingRate::Hz125),
            _ => Err(format!("Unsupported polling rate: {} Hz. Allowed: 1000, 500, 250, 125", hz)),
        }
    }

    pub fn flash_val(&self) -> u8 {
        match self {
            PollingRate::Hz1000 => 0x00,
            PollingRate::Hz500 => 0x01,
            PollingRate::Hz250 => 0x03,
            PollingRate::Hz125 => 0x07,
        }
    }

    /// Expected byte 6 in the feature report 0x07 status: (polling code << 5) | 0x03.
    /// On the real mouse: 1000 Hz = 0x03, 500 Hz = 0x23, 250 Hz = 0x63, 125 Hz = 0xE3.
    pub fn readback_byte6(&self) -> u8 {
        (self.flash_val() << 5) | 0x03
    }

    pub const ALL: [PollingRate; 4] = [PollingRate::Hz1000, PollingRate::Hz500, PollingRate::Hz250, PollingRate::Hz125];
}

pub fn get_chunk_table() -> Vec<(u16, usize)> {
    let mut chunks = vec![(0x0001, 1)];
    for a in (0x0008..0x0070).step_by(8) {
        chunks.push((a, 8));
    }
    for a in (0x0098..0x02D0).step_by(8) {
        chunks.push((a, 8));
    }
    chunks.push((0x006E, 2));
    chunks.push((0x0070, 8));
    chunks.push((0x0078, 3));
    chunks.push((0x007F, 1));
    for a in (0x0400..0x04C8).step_by(8) {
        chunks.push((a, 8));
    }
    chunks
}

pub fn load_base_image() -> Result<BTreeMap<u16, u8>, String> {
    let raw: BTreeMap<String, String> = serde_json::from_str(FACTORY_IMAGE_JSON)
        .map_err(|e| format!("Failed to parse factory_image.json: {}", e))?;
    let mut map = BTreeMap::new();
    for (k, v) in raw {
        let addr = u16::from_str_radix(k.trim_start_matches("0x"), 16)
            .map_err(|e| format!("Bad address {}: {}", k, e))?;
        let val = u8::from_str_radix(v.trim_start_matches("0x"), 16)
            .map_err(|e| format!("Bad value {}: {}", v, e))?;
        map.insert(addr, val);
    }
    if map.len() != 885 {
        return Err(format!("Base image size {} != 885", map.len()));
    }
    Ok(map)
}

/// The mouse's DPI table (stage code -> DPI), as in the vendor app. Code 11 does not exist.
pub const DPI_TABLE: [(u8, u32); 23] = [
    (1, 200), (2, 400), (3, 600), (4, 800), (5, 1000), (6, 1200), (7, 1400), (8, 1600),
    (9, 1800), (10, 2000), (12, 2400), (13, 3200), (14, 4000), (15, 4800), (16, 5600),
    (17, 6400), (18, 7200), (19, 8000), (20, 8800), (21, 9600), (22, 10400), (23, 11200),
    (24, 12800),
];

pub fn dpi_code_for(dpi: u32) -> Result<u8, String> {
    DPI_TABLE
        .iter()
        .find(|(_, v)| *v == dpi)
        .map(|(c, _)| *c)
        .ok_or_else(|| format!("Unsupported DPI value: {}", dpi))
}

/// Six DPI stage values plus which stage is active. Only these bytes change in flash:
/// 0x13 (code bit 4 per stage), 0x15..0x17 (code low nibbles), 0x18 (active stage).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DpiSettings {
    pub codes: [u8; 6],
    pub active_stage: u8,
}

impl DpiSettings {
    pub fn from_dpi_values(values: [u32; 6], active_stage: u8) -> Result<Self, String> {
        let mut codes = [0u8; 6];
        for (i, v) in values.iter().enumerate() {
            codes[i] = dpi_code_for(*v)?;
        }
        let s = DpiSettings { codes, active_stage };
        s.validate()?;
        Ok(s)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.active_stage > 5 {
            return Err(format!("Active stage {} out of range 0..5", self.active_stage));
        }
        for c in self.codes {
            if !DPI_TABLE.iter().any(|(k, _)| *k == c) {
                return Err(format!("Invalid DPI code {}", c));
            }
        }
        Ok(())
    }
}

/// Applies DPI settings onto an image. Keeps every other bit of the touched bytes.
pub fn apply_dpi_to_image(image: &mut BTreeMap<u16, u8>, dpi: &DpiSettings) -> Result<(), String> {
    dpi.validate()?;
    let mut msb = image.get(&0x0013).copied().ok_or("Image missing 0x13")? & !0x3F;
    for (i, c) in dpi.codes.iter().enumerate() {
        msb |= ((c >> 4) & 1) << i;
    }
    image.insert(0x0013, msb);
    for k in 0..3 {
        let hi = dpi.codes[2 * k] & 0x0F;
        let lo = dpi.codes[2 * k + 1] & 0x0F;
        image.insert(0x0015 + k as u16, (hi << 4) | lo);
    }
    let a = image.get(&0x0018).copied().ok_or("Image missing 0x18")?;
    image.insert(0x0018, (a & !0x07) | dpi.active_stage);
    Ok(())
}

/// Lighting as the vendor app stores it.
/// effect: vendor selector 0..13 (13 = LED Off, 12 = Button Response).
/// speed: 0 (slowest) ..5 (fastest). brightness: level 0 (brightest) ..7 (dimmest).
/// direction: 0 clockwise, 1 anticlockwise, 2 two-way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub struct LightingSettings {
    pub effect: u8,
    pub speed: u8,
    pub brightness: u8,
    pub direction: u8,
}

impl LightingSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.effect > 13 { return Err(format!("Invalid lighting effect {}", self.effect)); }
        if self.speed > 5 { return Err(format!("Invalid lighting speed {}", self.speed)); }
        if self.brightness > 7 { return Err(format!("Invalid lighting brightness level {}", self.brightness)); }
        if self.direction > 2 { return Err(format!("Invalid lighting direction {}", self.direction)); }
        Ok(())
    }
}

/// Writes lighting into 0x1C (effect low bits, flag, speed), 0x33 bit 7 (effect bit 3),
/// 0x3F bits 6..4 (brightness) and 0x3A bits 5..4 (direction). Other bits are kept.
pub fn apply_lighting_to_image(image: &mut BTreeMap<u16, u8>, l: &LightingSettings) -> Result<(), String> {
    l.validate()?;
    let get = |img: &BTreeMap<u16, u8>, a: u16| img.get(&a).copied().ok_or(format!("Image missing 0x{:02X}", a));
    let (b1c, bit3) = match l.effect {
        13 => (0xF7, 0),                // LED Off: vendor writes F7 (Ambilight id, speed 7)
        12 => (0x98 | l.speed, 0),      // Button Response: id 1 + flag bit 3
        e => (0x80 | ((e & 7) << 4) | l.speed, e >> 3),
    };
    image.insert(0x001C, b1c);
    let b33 = get(image, 0x0033)?;
    image.insert(0x0033, (b33 & 0x7F) | (bit3 << 7));
    let b3f = get(image, 0x003F)?;
    image.insert(0x003F, (b3f & 0x8F) | (l.brightness << 4));
    let b3a = get(image, 0x003A)?;
    image.insert(0x003A, (b3a & 0xCF) | (l.direction << 4));
    Ok(())
}

pub fn generate_polling_packets(
    target_rate: PollingRate,
) -> Result<Vec<Vec<u8>>, String> {
    generate_packets(target_rate, None, None)
}

/// Builds the full-image rewrite. It starts from the factory image, so every setting
/// not given here is reset to its factory value.
pub fn generate_packets(
    target_rate: PollingRate,
    dpi: Option<&DpiSettings>,
    lighting: Option<&LightingSettings>,
) -> Result<Vec<Vec<u8>>, String> {
    let mut image = load_base_image()?;
    // Apply polling rate at 0x001E
    image.insert(0x001E, target_rate.flash_val());
    if let Some(d) = dpi {
        apply_dpi_to_image(&mut image, d)?;
    }
    if let Some(l) = lighting {
        apply_lighting_to_image(&mut image, l)?;
    }
    packets_from_image(&image)
}

fn packets_from_image(image: &BTreeMap<u16, u8>) -> Result<Vec<Vec<u8>>, String> {
    let chunks = get_chunk_table();
    let mut packets = Vec::with_capacity(1117);

    for (addr, size) in chunks {
        let sub_max = (size - 1) as u8;
        let addr_lo = (addr & 0xFF) as u8;
        let addr_hi = ((addr >> 8) & 0xFF) as u8;

        // 1. Action 0x03 Payload packets
        for sub in 0..size {
            let cur_addr = addr + (sub as u16);
            if cur_addr < 0x0001 || cur_addr > MAX_OBSERVED_ADDR {
                return Err(format!("Address 0x{:04X} out of whitelist range 0x0001..0x04C7", cur_addr));
            }

            let val = if addr == 0x0068 && (sub == 6 || sub == 7) {
                // Address 0x006E..0x006F staging buffer state: holds 0xC8, 0x04
                if sub == 6 { 0xC8 } else { 0x04 }
            } else if let Some(&v) = image.get(&cur_addr) {
                v
            } else {
                return Err(format!("Missing memory address 0x{:04X} in image", cur_addr));
            };

            let pkt = vec![EXPECTED_REPORT_ID, EXPECTED_CMD_ID, 0x03, sub as u8, addr_lo, addr_hi, val, sub_max];
            packets.push(pkt);
        }

        // 2. Action 0x09 Chunk Commit
        packets.push(vec![EXPECTED_REPORT_ID, EXPECTED_CMD_ID, 0x09, 0x00, addr_lo, addr_hi, 0x00, sub_max]);

        // 3. Action 0x00 Chunk Reset
        packets.push(vec![EXPECTED_REPORT_ID, EXPECTED_CMD_ID, 0x00, 0x00, addr_lo, addr_hi, 0x00, 0x00]);
    }

    // 4. Action 0x10 Transaction Commit
    packets.push(vec![EXPECTED_REPORT_ID, EXPECTED_CMD_ID, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00]);

    // 5. Action 0x00 Final Reset
    packets.push(vec![EXPECTED_REPORT_ID, EXPECTED_CMD_ID, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    if packets.len() != 1117 {
        return Err(format!("Generated packet count {} != 1117", packets.len()));
    }

    // Hard whitelist check on all generated packets
    for (i, p) in packets.iter().enumerate() {
        if p.len() != EXPECTED_PACKET_LEN {
            return Err(format!("Packet #{} invalid length {}", i + 1, p.len()));
        }
        if p[0] != EXPECTED_REPORT_ID {
            return Err(format!("Packet #{} invalid report ID 0x{:02X}", i + 1, p[0]));
        }
        if p[1] != EXPECTED_CMD_ID {
            return Err(format!("Packet #{} invalid opcode 0x{:02X}", i + 1, p[1]));
        }
    }

    Ok(packets)
}

pub fn calculate_packet_delay(action: u8, prev_action: Option<u8>) -> u64 {
    if action == 0x09 {
        4 // Min 4ms before chunk commit
    } else if action == 0x00 && prev_action == Some(0x09) {
        2 // Min 2ms before chunk reset
    } else if action == 0x00 && prev_action == Some(0x10) {
        5 // Min 5ms before final reset
    } else {
        0
    }
}

pub trait HidTransport {
    fn send_feature_report(&mut self, data: &[u8]) -> Result<(), String>;
    fn get_feature_report(&mut self, report_id: u8, buf: &mut [u8]) -> Result<usize, String>;
}

pub struct RealHidTransport<'a> {
    pub device: &'a hidapi::HidDevice,
}

impl<'a> HidTransport for RealHidTransport<'a> {
    fn send_feature_report(&mut self, data: &[u8]) -> Result<(), String> {
        self.device.send_feature_report(data).map_err(|e| e.to_string())
    }

    fn get_feature_report(&mut self, report_id: u8, buf: &mut [u8]) -> Result<usize, String> {
        if buf.is_empty() {
            return Err("Buffer is empty".to_string());
        }
        buf[0] = report_id;
        self.device.get_feature_report(buf).map_err(|e| e.to_string())
    }
}

pub struct MockTransport {
    pub sent_packets: Vec<Vec<u8>>,
    pub get_feature_responses: Vec<Vec<u8>>,
    pub get_feature_calls: usize,
    pub fail_at_send_index: Option<usize>,
}

impl MockTransport {
    pub fn new() -> Self {
        Self {
            sent_packets: Vec::new(),
            get_feature_responses: Vec::new(),
            get_feature_calls: 0,
            fail_at_send_index: None,
        }
    }

    pub fn with_default_response(payload: Vec<u8>) -> Self {
        let mut m = Self::new();
        m.get_feature_responses.push(payload);
        m
    }
}

impl Default for MockTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl HidTransport for MockTransport {
    fn send_feature_report(&mut self, data: &[u8]) -> Result<(), String> {
        if let Some(idx) = self.fail_at_send_index {
            if self.sent_packets.len() == idx {
                return Err("Simulated OS write failure: Windows error 31 (ERROR_GEN_FAILURE)".to_string());
            }
        }
        self.sent_packets.push(data.to_vec());
        Ok(())
    }

    fn get_feature_report(&mut self, _report_id: u8, buf: &mut [u8]) -> Result<usize, String> {
        let resp = if !self.get_feature_responses.is_empty() {
            let idx = self.get_feature_calls.min(self.get_feature_responses.len() - 1);
            self.get_feature_responses[idx].clone()
        } else {
            vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2]
        };
        self.get_feature_calls += 1;
        let copy_len = buf.len().min(resp.len());
        buf[..copy_len].copy_from_slice(&resp[..copy_len]);
        Ok(copy_len)
    }
}

pub trait ProcessChecker {
    fn is_process_running(&self, process_names: &[&str]) -> Option<String>;
}

pub struct SystemProcessChecker;

impl ProcessChecker for SystemProcessChecker {
    fn is_process_running(&self, process_names: &[&str]) -> Option<String> {
        let output = std::process::Command::new("tasklist")
            .arg("/FO")
            .arg("CSV")
            .arg("/NH")
            .output();

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
            for name in process_names {
                let name_lower = name.to_lowercase();
                if stdout.contains(&name_lower) {
                    return Some(name.to_string());
                }
            }
        }
        None
    }
}

/// Guarded polling-rate-only write. Same checks as `apply_settings`.
pub fn apply_polling<T: HidTransport, P: ProcessChecker>(
    transport: &mut T,
    process_checker: &P,
    rate: PollingRate,
) -> Result<usize, String> {
    apply_settings(transport, process_checker, rate, None, None)
}

/// The guarded write. In order: refuse while the vendor app runs, check the mouse's status,
/// send all packets (stopping at the first error, never retrying), then read the status back
/// five times and stop at the first mismatch. Returns the number of packets sent.
pub fn apply_settings<T: HidTransport, P: ProcessChecker>(
    transport: &mut T,
    process_checker: &P,
    rate: PollingRate,
    dpi: Option<&DpiSettings>,
    lighting: Option<&LightingSettings>,
) -> Result<usize, String> {
    // (a) Refuse if vendor application is running
    let conflicting = process_checker.is_process_running(&["Gaming Mouse 3.0.exe", "CB Spectrum Gaming Mouse"]);
    if let Some(proc) = conflicting {
        return Err(format!("Refusing write: conflicting vendor process '{}' is running.", proc));
    }

    // (b) Read the status (feature report 0x07, bytes 1..8) and refuse unless it has the
    // known layout. Byte 4 changes on its own and the vendor app never reads it, so it is ignored.
    let mut read_buf = [0u8; 32];
    let n = transport.get_feature_report(EXPECTED_REPORT_ID, &mut read_buf)
        .map_err(|e| format!("Pre-send state read failed: {}", e))?;
    let dev_bytes = bytes_1_to_8(&read_buf[..n])
        .map_err(|e| format!("Pre-send device read error: {}", e))?;

    // Known layout: 00 68 09 .. 00 P S x  (byte 4 ignored)
    //   P = polling byte, one of 03/23/63/E3
    //   S = (current effect << 4) | 0xB; the effect nibble follows lighting and can lag a write
    //   x = byte 8, meaning unknown, informational only
    let allowed_b6: Vec<u8> = PollingRate::ALL.iter().map(|r| r.readback_byte6()).collect();
    let pre_problems = status_problems(dev_bytes, &allowed_b6);
    if !pre_problems.is_empty() {
        return Err(format!(
            "Hardware state drift detected! Current bytes 1..8: [{}] does not match the known layout [00 68 09 .. 00 P xB ..] ({}). Stopping without sending packets.",
            hex_str(dev_bytes),
            pre_problems.join(", ")
        ));
    }

    // Generate packets
    let packets = generate_packets(rate, dpi, lighting)?;

    // (c) Transmit stream with gap rules
    let mut sent_count = 0;
    let mut prev_action: Option<u8> = None;
    for (idx, pkt) in packets.iter().enumerate() {
        let delay_ms = calculate_packet_delay(pkt[2], prev_action);
        if delay_ms > 0 {
            thread::sleep(Duration::from_millis(delay_ms));
        }

        if let Err(e) = transport.send_feature_report(pkt) {
            return Err(format!("Send failed at packet #{}: {}. Stopping immediately without retry.", idx + 1, e));
        }
        sent_count += 1;
        prev_action = Some(pkt[2]);
    }

    // (d) Read back 5 times, comparing bytes 1,2,3,5,6,7,8 (ignoring byte 4); stop at first mismatch
    let expected_b6 = rate.readback_byte6();

    for i in 1..=5 {
        thread::sleep(Duration::from_millis(50));
        let mut buf = [0u8; 32];
        let bytes_read = transport.get_feature_report(EXPECTED_REPORT_ID, &mut buf)
            .map_err(|e| format!("Post-send read #{} failed: {}", i, e))?;
        let post_bytes = bytes_1_to_8(&buf[..bytes_read])
            .map_err(|e| format!("Post-send read #{} slice error: {}", i, e))?;

        let mismatches = status_problems(post_bytes, &[expected_b6]);
        if !mismatches.is_empty() {
            return Err(format!(
                "Post-send read #{}/5 mismatch: {}. Stopping immediately without retry.",
                i, mismatches.join(", ")
            ));
        }
    }

    Ok(sent_count)
}

/// Tauri IPC: one guarded write with the polling rate and, optionally, the six DPI
/// stages (values in DPI) plus the active stage index.
pub fn apply_settings_ipc(
    requested_path: Option<&str>,
    polling_hz: u32,
    dpi: Option<([u32; 6], u8)>,
    lighting: Option<LightingSettings>,
) -> Result<usize, String> {
    if let Some(l) = &lighting {
        l.validate()?;
    }
    let rate = PollingRate::from_hz(polling_hz)?;
    let dpi = match dpi {
        Some((values, active)) => Some(DpiSettings::from_dpi_values(values, active)?),
        None => None,
    };
    with_hid(true, |api| {
        let dev_list: Vec<_> = api.device_list().collect();
        let validated_path = resolve_target_device_path(&dev_list, requested_path)?;
        let c_path = std::ffi::CString::new(validated_path).map_err(|e| format!("Invalid device path: {}", e))?;
        let dev = api.open_path(&c_path).map_err(|e| format!("Failed to open HID device: {}", e))?;
        let mut transport = RealHidTransport { device: &dev };
        apply_settings(&mut transport, &SystemProcessChecker, rate, dpi.as_ref(), lighting.as_ref())
    })
}

/// Helper for Tauri IPC invocation: Rust finds and validates the device itself.
pub fn apply_polling_ipc(requested_path: Option<&str>, rate_hz: u32) -> Result<usize, String> {
    let rate = PollingRate::from_hz(rate_hz)?;
    with_hid(true, |api| {
        let dev_list: Vec<_> = api.device_list().collect();
        let validated_path = resolve_target_device_path(&dev_list, requested_path)?;
        let c_path = std::ffi::CString::new(validated_path).map_err(|e| format!("Invalid device path: {}", e))?;
        let dev = api.open_path(&c_path).map_err(|e| format!("Failed to open HID device: {}", e))?;
        let mut transport = RealHidTransport { device: &dev };
        apply_polling(&mut transport, &SystemProcessChecker, rate)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestProcChecker {
        running: Option<String>,
    }

    impl ProcessChecker for TestProcChecker {
        fn is_process_running(&self, _process_names: &[&str]) -> Option<String> {
            self.running.clone()
        }
    }

    #[test]
    fn test_protocol_250_and_125_differ_only_at_0x1e() {
        let pkts_1000 = generate_polling_packets(PollingRate::Hz1000).unwrap();
        let pkts_250 = generate_polling_packets(PollingRate::Hz250).unwrap();
        let pkts_125 = generate_polling_packets(PollingRate::Hz125).unwrap();

        assert_eq!(pkts_250.len(), 1117);
        assert_eq!(pkts_125.len(), 1117);

        let mut diffs_250 = Vec::new();
        let mut diffs_125 = Vec::new();

        for i in 0..1117 {
            if pkts_250[i] != pkts_1000[i] {
                diffs_250.push(i + 1); // 1-based packet number
            }
            if pkts_125[i] != pkts_1000[i] {
                diffs_125.push(i + 1);
            }
        }

        // Only packet #30 (which writes 0x0018 + sub 6 = 0x001E) differs!
        assert_eq!(diffs_250, vec![30], "250 Hz must differ ONLY at packet #30 (addr 0x001E)");
        assert_eq!(diffs_125, vec![30], "125 Hz must differ ONLY at packet #30 (addr 0x001E)");

        // Value in packet #30 byte 6
        assert_eq!(pkts_250[29][6], 0x03, "250 Hz flash value must be 0x03");
        assert_eq!(pkts_125[29][6], 0x07, "125 Hz flash value must be 0x07");
    }

    #[test]
    fn test_protocol_hard_whitelist() {
        let pkts = generate_polling_packets(PollingRate::Hz1000).unwrap();
        for (i, p) in pkts.iter().enumerate() {
            assert_eq!(p.len(), 8, "Packet #{} length != 8", i + 1);
            assert_eq!(p[0], 0x07, "Packet #{} report ID != 0x07", i + 1);
            assert_eq!(p[1], 0x18, "Packet #{} opcode != 0x18", i + 1);
            if p[2] == 0x03 {
                let sub = p[3] as u16;
                let addr = (p[4] as u16) | ((p[5] as u16) << 8);
                let target = addr + sub;
                assert!(target >= 0x0001 && target <= 0x04C7, "Target addr 0x{:04X} out of range", target);
            }
        }
    }

    #[test]
    fn test_apply_polling_refuses_when_vendor_app_running() {
        let mut transport = MockTransport::new();
        let checker = TestProcChecker { running: Some("Gaming Mouse 3.0.exe".to_string()) };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Gaming Mouse 3.0.exe"));
        assert_eq!(transport.sent_packets.len(), 0, "Zero packets sent if vendor app running");
    }

    #[test]
    fn test_apply_polling_drift_refusal() {
        // Unknown/drifted pre-send response: byte 2 is 0x99 instead of 0x68 (non-byte4 drift)
        let drifted = vec![0x07, 0x00, 0x99, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::with_default_response(drifted);
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Hardware state drift detected"));
        assert_eq!(transport.sent_packets.len(), 0, "Zero packets sent on drift");
    }

    #[test]
    fn test_apply_polling_byte4_differs_is_match() {
        // Pre-send response has byte 4 = 0x49 instead of 0x54: ignored for drift check -> MATCH
        let byte4_differs_pre = vec![0x07, 0x00, 0x68, 0x09, 0x49, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        let valid_post_500 = vec![0x07, 0x00, 0x68, 0x09, 0x49, 0x00, 0x23, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::new();
        transport.get_feature_responses.push(byte4_differs_pre);
        for _ in 0..5 {
            transport.get_feature_responses.push(valid_post_500.clone());
        }
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_ok(), "Byte 4 differing must not prevent match: {:?}", res.err());
        assert_eq!(transport.sent_packets.len(), 1117);
    }

    #[test]
    fn test_apply_polling_wrong_byte6_in_pre_send_refused() {
        // Pre-send has wrong polling byte 6 = 0x55 (neither 0x03 nor 0x23)
        let wrong_b6_pre = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x55, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::with_default_response(wrong_b6_pre);
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Hardware state drift detected"));
        assert_eq!(transport.sent_packets.len(), 0, "Zero packets sent on wrong pre-send byte 6");
    }

    #[test]
    fn test_apply_polling_send_failure_at_packet_n() {
        let valid_pre = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::with_default_response(valid_pre);
        transport.fail_at_send_index = Some(49); // Fail at 0-based index 49 (packet #50)
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("packet #50"), "Error must cite 1-based packet index: {}", err);
        assert_eq!(transport.sent_packets.len(), 49, "Must stop immediately at packet #50 without sending further");
    }

    #[test]
    fn test_apply_polling_post_send_mismatch() {
        let valid_pre = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::new();
        // 1st get_feature: valid pre-state
        transport.get_feature_responses.push(valid_pre);
        // 2nd get_feature: post-send read with wrong byte 6 (0x03 instead of 0x23)
        transport.get_feature_responses.push(vec![
            0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00
        ]);
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert!(err.contains("Post-send read #1/5 mismatch"), "Must detect post-send mismatch: {}", err);
        assert_eq!(transport.sent_packets.len(), 1117, "All 1117 packets were sent before verification failed");
    }

    #[test]
    fn test_apply_polling_post_send_byte4_differs_is_ignored() {
        let valid_pre = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        // Post-send has byte 4 = 0x77 (different from pre-send and baseline), but byte 6 = 0x23 is correct
        let post_b4_differs = vec![0x07, 0x00, 0x68, 0x09, 0x77, 0x00, 0x23, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::new();
        transport.get_feature_responses.push(valid_pre);
        for _ in 0..5 {
            transport.get_feature_responses.push(post_b4_differs.clone());
        }
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_ok(), "Byte 4 differing in post-send must be ignored: {:?}", res.err());
        assert_eq!(transport.sent_packets.len(), 1117);
    }

    #[test]
    fn test_apply_polling_success() {
        let valid_pre = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x03, 0xAB, 0xA2, 0x00];
        let valid_post_500 = vec![0x07, 0x00, 0x68, 0x09, 0x54, 0x00, 0x23, 0xAB, 0xA2, 0x00];
        let mut transport = MockTransport::new();
        transport.get_feature_responses.push(valid_pre);
        for _ in 0..5 {
            transport.get_feature_responses.push(valid_post_500.clone());
        }
        let checker = TestProcChecker { running: None };

        let res = apply_polling(&mut transport, &checker, PollingRate::Hz500);
        assert!(res.is_ok(), "Expected success: {:?}", res.err());
        assert_eq!(res.unwrap(), 1117);
        assert_eq!(transport.sent_packets.len(), 1117);
    }

    #[test]
    fn test_wrong_path_cannot_redirect_write() {
        let genuine_col04 = MockDeviceDescriptor {
            vendor_id: TARGET_VID,
            product_id: TARGET_PID,
            usage_page: TARGET_USAGE_PAGE,
            path: r"\\?\hid#vid_30fa&pid_1440&mi_01&col04#path1".to_string(),
        };
        let spectrum_col01 = MockDeviceDescriptor {
            vendor_id: TARGET_VID,
            product_id: TARGET_PID,
            usage_page: 0x0001,
            path: r"\\?\hid#vid_30fa&pid_1440&mi_00&col01#path2".to_string(),
        };
        let wrong_device = MockDeviceDescriptor {
            vendor_id: 0x046D,
            product_id: 0xC077,
            usage_page: 0x0001,
            path: r"\\?\hid#vid_046d&pid_c077#other".to_string(),
        };

        let devices = vec![wrong_device.clone(), spectrum_col01.clone(), genuine_col04.clone()];

        // 1. Rust finds target device itself when no path provided
        let resolved = resolve_target_device_path(&devices, None).expect("Must resolve genuine device");
        assert_eq!(resolved, genuine_col04.path);

        // 2. Rust accepts when matching path provided
        let resolved_matching = resolve_target_device_path(&devices, Some(&genuine_col04.path)).expect("Must match genuine device");
        assert_eq!(resolved_matching, genuine_col04.path);

        // 3. Wrong device path redirected to another device MUST be rejected
        let err_wrong_dev = resolve_target_device_path(&devices, Some(&wrong_device.path))
            .expect_err("Must reject wrong device path");
        assert!(err_wrong_dev.contains("Security rejection"));
        assert!(err_wrong_dev.contains("Writes cannot be redirected"));

        // 4. Wrong collection (col01) on same mouse MUST be rejected
        let err_wrong_col = resolve_target_device_path(&devices, Some(&spectrum_col01.path))
            .expect_err("Must reject non-col04 collection");
        assert!(err_wrong_col.contains("Security rejection"));
        assert!(err_wrong_col.contains("Writes cannot be redirected"));

        // 5. Completely fabricated path MUST be rejected
        let err_fabricated = resolve_target_device_path(&devices, Some(r"\\?\hid#fake_target#random"))
            .expect_err("Must reject fabricated path");
        assert!(err_fabricated.contains("Security rejection"));

        // 6. If target mouse is not connected, must fail safely
        let no_target_devices = vec![wrong_device];
        let err_not_found = resolve_target_device_path(&no_target_devices, None)
            .expect_err("Must fail when target not connected");
        assert!(err_not_found.contains("target endpoint not found"));
    }

    #[test]
    fn test_dpi_table_matches_known_captures() {
        for (dpi, code) in [(200, 1), (400, 2), (800, 4), (1600, 8), (2400, 12), (3200, 13), (6400, 17), (10400, 22), (12800, 24)] {
            assert_eq!(dpi_code_for(dpi).unwrap(), code);
        }
        assert!(dpi_code_for(2200).is_err());
        assert!(dpi_code_for(500).is_err());
    }

    fn diff_vs_base(dpi: &DpiSettings) -> Vec<(u16, u8)> {
        let base = load_base_image().unwrap();
        let mut img = base.clone();
        img.insert(0x001E, PollingRate::Hz1000.flash_val());
        apply_dpi_to_image(&mut img, dpi).unwrap();
        base.iter().filter(|(k, v)| img[k] != **v).map(|(k, _)| (*k, img[k])).collect()
    }

    const FACTORY: [u32; 6] = [800, 1600, 3200, 6400, 10400, 12800];

    #[test]
    fn test_dpi_factory_values_change_nothing() {
        let d = DpiSettings::from_dpi_values(FACTORY, 0).unwrap();
        assert!(diff_vs_base(&d).is_empty());
    }

    // Expected diffs below come from recorded vendor-app writes.
    #[test]
    fn test_dpi_matches_captured_diffs() {
        let mut v = FACTORY;
        v[0] = 200;
        assert_eq!(diff_vs_base(&DpiSettings::from_dpi_values(v, 0).unwrap()), vec![(0x15, 0x18)]);
        v[0] = 3200;
        assert_eq!(diff_vs_base(&DpiSettings::from_dpi_values(v, 0).unwrap()), vec![(0x15, 0xD8)]);
        v[0] = 6400;
        assert_eq!(diff_vs_base(&DpiSettings::from_dpi_values(v, 0).unwrap()), vec![(0x13, 0x39), (0x15, 0x18)]);
        v[0] = 12800;
        assert_eq!(diff_vs_base(&DpiSettings::from_dpi_values(v, 0).unwrap()), vec![(0x13, 0x39), (0x15, 0x88)]);
        v[1] = 2400;
        assert_eq!(
            diff_vs_base(&DpiSettings::from_dpi_values(v, 1).unwrap()),
            vec![(0x13, 0x39), (0x15, 0x8C), (0x18, 0x19)]
        );
    }

    #[test]
    fn test_dpi_packets_touch_only_dpi_bytes() {
        let base = generate_polling_packets(PollingRate::Hz1000).unwrap();
        let mut v = FACTORY;
        v[0] = 12800;
        v[1] = 2400;
        let d = DpiSettings::from_dpi_values(v, 1).unwrap();
        let pk = generate_packets(PollingRate::Hz1000, Some(&d), None).unwrap();
        assert_eq!(pk.len(), 1117);
        let mut addrs = Vec::new();
        for (a, b) in base.iter().zip(pk.iter()) {
            if a != b {
                assert_eq!(a[2], 0x03, "only payload packets may differ");
                addrs.push((a[4] as u16 | (a[5] as u16) << 8) + a[3] as u16);
            }
        }
        assert_eq!(addrs, vec![0x13, 0x15, 0x18]);
    }

    #[test]
    fn test_dpi_rejects_bad_input() {
        assert!(DpiSettings::from_dpi_values([800, 1600, 3200, 6400, 10400, 999], 0).is_err());
        assert!(DpiSettings::from_dpi_values(FACTORY, 6).is_err());
        assert!(DpiSettings { codes: [11, 1, 1, 1, 1, 1], active_stage: 0 }.validate().is_err());
    }

    #[test]
    fn test_readback_byte6_rule() {
        assert_eq!(PollingRate::Hz1000.readback_byte6(), 0x03);
        assert_eq!(PollingRate::Hz500.readback_byte6(), 0x23);
        assert_eq!(PollingRate::Hz250.readback_byte6(), 0x63);
        assert_eq!(PollingRate::Hz125.readback_byte6(), 0xE3); // seen on the real mouse
    }

    #[test]
    fn test_apply_from_125hz_state_is_allowed() {
        // The exact bytes the mouse reported after the 125 Hz write on 2026-11-11.
        let at_125 = vec![0x07, 0x00, 0x68, 0x09, 0x48, 0x00, 0xE3, 0xAB, 0xA2, 0x00];
        let mut pre_ok = MockTransport::with_default_response(at_125);
        let checker = TestProcChecker { running: None };
        let res = apply_polling(&mut pre_ok, &checker, PollingRate::Hz125);
        assert!(res.is_ok(), "{:?}", res);
    }

    fn lighting_diff(l: &LightingSettings) -> Vec<(u16, u8)> {
        let base = load_base_image().unwrap();
        let mut img = base.clone();
        apply_lighting_to_image(&mut img, l).unwrap();
        base.iter().filter(|(k, v)| img[k] != **v).map(|(k, _)| (*k, img[k])).collect()
    }

    #[test]
    fn test_lighting_factory_is_ripple_speed2() {
        // Factory image: 1C=A2, 33=BF, 3A=4B, 3F=00 = Ripple (10), speed 2, clockwise, brightest.
        let l = LightingSettings { effect: 10, speed: 2, brightness: 0, direction: 0 };
        assert!(lighting_diff(&l).is_empty());
    }

    // Byte values below are the ones seen in recorded vendor-app writes.
    #[test]
    fn test_lighting_bytes_match_captures() {
        let l = |effect, speed| LightingSettings { effect, speed, brightness: 0, direction: 0 };
        assert_eq!(lighting_diff(&l(2, 2)), vec![(0x33, 0x3F)]); // Light On A2 / 3F
        assert_eq!(lighting_diff(&l(3, 5)), vec![(0x1C, 0xB5), (0x33, 0x3F)]); // Flowing Water B5
        assert_eq!(lighting_diff(&l(3, 0)), vec![(0x1C, 0xB0), (0x33, 0x3F)]);
        assert_eq!(lighting_diff(&l(7, 3)), vec![(0x1C, 0xF3), (0x33, 0x3F)]); // Ambilight F3
        assert_eq!(lighting_diff(&l(8, 5)), vec![(0x1C, 0x85)]); // Flicker 85 / BF
        assert_eq!(lighting_diff(&l(11, 3)), vec![(0x1C, 0xB3)]); // Enraptured B3 / BF
        assert_eq!(lighting_diff(&l(12, 3)), vec![(0x1C, 0x9B), (0x33, 0x3F)]); // Button Response 9B
        assert_eq!(lighting_diff(&l(13, 3)), vec![(0x1C, 0xF7), (0x33, 0x3F)]); // Off F7 / 3F
        // direction 1 -> 3A=5B, 2 -> 6B; brightness level 6 -> 3F=60
        let d = LightingSettings { effect: 10, speed: 2, brightness: 6, direction: 1 };
        assert_eq!(lighting_diff(&d), vec![(0x3A, 0x5B), (0x3F, 0x60)]);
        let d2 = LightingSettings { effect: 10, speed: 2, brightness: 0, direction: 2 };
        assert_eq!(lighting_diff(&d2), vec![(0x3A, 0x6B)]);
    }

    #[test]
    fn test_lighting_rejects_bad_values() {
        for l in [
            LightingSettings { effect: 14, speed: 0, brightness: 0, direction: 0 },
            LightingSettings { effect: 2, speed: 6, brightness: 0, direction: 0 },
            LightingSettings { effect: 2, speed: 0, brightness: 8, direction: 0 },
            LightingSettings { effect: 3, speed: 0, brightness: 0, direction: 3 },
        ] {
            assert!(l.validate().is_err());
        }
    }

    #[test]
    fn test_status_check_accepts_other_effect_nibble_and_byte8() {
        let allowed: Vec<u8> = PollingRate::ALL.iter().map(|r| r.readback_byte6()).collect();
        assert!(status_problems(&[0x00, 0x68, 0x09, 0x48, 0x00, 0x03, 0x3B, 0xB5], &allowed).is_empty());
        assert!(!status_problems(&[0x00, 0x68, 0x09, 0x48, 0x00, 0x03, 0x3C, 0xA2], &allowed).is_empty());
        assert!(!status_problems(&[0x00, 0x99, 0x09, 0x48, 0x00, 0x03, 0xAB, 0xA2], &allowed).is_empty());
    }
}
