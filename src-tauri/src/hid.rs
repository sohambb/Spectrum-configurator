//! Read-only USB access for the app: finding the mouse and reading its status.
//! All writes go through the guarded path in the spectrum-protocol crate.

use serde::Serialize;
use spectrum_protocol::{with_hid, TARGET_PID, TARGET_VID};
use std::ffi::CString;

/// Vendor-defined usage pages of the mouse. The normal mouse, keyboard and media
/// interfaces are never listed or opened.
const VENDOR_USAGE_PAGES: [u16; 2] = [0xFF00, 0xFF01];

/// One HID interface of the mouse, as sent to the UI.
#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfo {
    pub path: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub usage: u16,
}

/// Lists the mouse's vendor interfaces. Returns Err("busy") while a write is running.
pub fn scan_spectrum_devices() -> Result<Vec<DeviceInfo>, String> {
    with_hid(false, |api| {
        Ok(api
            .device_list()
            .filter(|d| {
                d.vendor_id() == TARGET_VID
                    && d.product_id() == TARGET_PID
                    && VENDOR_USAGE_PAGES.contains(&d.usage_page())
            })
            .map(|d| DeviceInfo {
                path: d.path().to_string_lossy().to_string(),
                vendor_id: d.vendor_id(),
                product_id: d.product_id(),
                usage_page: d.usage_page(),
                usage: d.usage(),
            })
            .collect())
    })
}

/// Reads one feature report from one of the mouse's interfaces. Never waits: returns
/// Err("busy") while a write is running.
pub fn read_feature_report(device_path: &str, report_id: u8) -> Result<Vec<u8>, String> {
    with_hid(false, |api| {
        if !api.device_list().any(|d| d.path().to_string_lossy() == device_path) {
            return Err("Device path is not a Cosmic Byte Spectrum interface".to_string());
        }
        let c_path = CString::new(device_path).map_err(|e| format!("Invalid device path: {}", e))?;
        let device = api.open_path(&c_path).map_err(|e| format!("Failed to open HID device: {}", e))?;
        let mut buf = vec![0u8; 32];
        buf[0] = report_id;
        let n = device
            .get_feature_report(&mut buf)
            .map_err(|e| format!("Feature report read failed: {}", e))?;
        buf.truncate(n);
        Ok(buf)
    })
}
