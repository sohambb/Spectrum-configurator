mod hid;

use hid::{read_feature_report, scan_spectrum_devices, DeviceInfo};
use spectrum_protocol::{apply_settings_ipc, LightingSettings, NOT_SENT_PREFIX};

/// Runs slow USB work on a worker thread so the window never freezes while it runs.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Background task failed: {}", e))?
}

#[tauri::command]
async fn hid_scan_devices() -> Result<Vec<DeviceInfo>, String> {
    blocking(scan_spectrum_devices).await
}

/// Guarded write of the polling rate plus, optionally, the six DPI stages and the lighting,
/// in one flash rewrite. Rust finds and validates the device itself (VID 0x30FA, PID 0x1440,
/// usage page 0xFF01, col04); the path from the UI cannot redirect writes.
#[tauri::command]
async fn hid_apply_settings(
    path: Option<String>,
    polling_hz: u32,
    dpi_values: Option<Vec<u32>>,
    active_stage: Option<u8>,
    lighting: Option<LightingSettings>,
) -> Result<usize, String> {
    let dpi = match dpi_values {
        Some(v) => {
            let values: [u32; 6] = v
                .try_into()
                .map_err(|_| format!("{}Exactly 6 DPI stage values are required", NOT_SENT_PREFIX))?;
            let active = active_stage.ok_or_else(|| format!("{}Active stage is required with DPI values", NOT_SENT_PREFIX))?;
            Some((values, active))
        }
        None => None,
    };
    blocking(move || apply_settings_ipc(path.as_deref(), polling_hz, dpi, lighting)).await
}

#[tauri::command]
async fn hid_read_report(path: String, report_id: u8) -> Result<Vec<u8>, String> {
    blocking(move || read_feature_report(&path, report_id)).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            hid_scan_devices,
            hid_apply_settings,
            hid_read_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
