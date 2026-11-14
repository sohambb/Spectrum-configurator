# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub instead: go to the **Security** tab of this repository and click **Report a vulnerability**.

Include what you found, how to reproduce it, and which version you used. You will get a reply once the report has been looked at, and a fix will be released as soon as possible.

## Scope

The app only talks to the Cosmic Byte Spectrum mouse (VID `0x30FA`, PID `0x1440`) on its vendor HID interface, and exposes no network, file-system or shell commands to its interface. Reports about anything that lets the app write to another device, run code, or read files are especially welcome.
