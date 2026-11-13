/** One HID interface of the mouse, as reported by the Rust side. */
export interface HidDeviceInfo {
  path: string;
  vendor_id: number;
  product_id: number;
  usage_page: number;
  usage: number;
}
