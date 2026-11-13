mod hid;

use hid::{read_feature_report, scan_spectrum_devices, DeviceInfo};
use spectrum_protocol::{apply_polling_ipc, apply_settings_ipc, LightingSettings};

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

#[tauri::command]
async fn hid_set_polling_rate(path: Option<String>, rate_hz: u32) -> Result<usize, String> {
    // Rust finds and validates the device itself (VID 0x30FA, PID 0x1440, usage page 0xFF01, col04).
    // The path from the UI is validated and cannot redirect writes.
    blocking(move || apply_polling_ipc(path.as_deref(), rate_hz)).await
}

/// Guarded write of polling rate plus, optionally, the six DPI stages and the lighting,
/// in one flash rewrite. Same safety checks as the polling write.
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
                .map_err(|_| "Exactly 6 DPI stage values are required".to_string())?;
            Some((values, active_stage.ok_or("Active stage is required with DPI values")?))
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
            hid_set_polling_rate,
            hid_apply_settings,
            hid_read_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
