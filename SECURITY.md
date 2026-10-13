# Security

Please report security issues through GitHub's private vulnerability reporting for this
repository once it is published. Do not include credentials or private image URLs in
public issues.

The module runs in the browser. Its default scene is procedural and requires no network
requests. Caller-provided label URLs may cause image requests; use trusted sources.
Do not render sensitive artwork into a canvas whose snapshots will be shared.

Call `dispose()` when removing an instance to release its rendering resources.
