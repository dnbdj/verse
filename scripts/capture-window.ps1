param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$OutFile,
  [switch]$AllowScreenFallback
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
}
"@

[WinCap]::SetProcessDPIAware() | Out-Null

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$handle = $proc.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) {
  throw "No main window handle for process $ProcessId"
}

Start-Sleep -Milliseconds 1600

$rect = New-Object WinCap+RECT
[WinCap]::GetWindowRect($handle, [ref]$rect) | Out-Null

# A maximized window reports bounds slightly off-screen; clamp to the virtual desktop.
$screenWidth = [WinCap]::GetSystemMetrics(78)
$screenHeight = [WinCap]::GetSystemMetrics(79)
$left = [Math]::Max($rect.Left, 0)
$top = [Math]::Max($rect.Top, 0)
$right = [Math]::Min($rect.Right, $screenWidth)
$bottom = [Math]::Min($rect.Bottom, $screenHeight)
$width = $right - $left
$height = $bottom - $top
if ($width -le 0 -or $height -le 0) { throw "Bad window rect $width x $height" }

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# Capture the window itself, never the screen region: a region copy grabs whatever
# is on top, which would photograph the user's other windows.
$hdc = $graphics.GetHdc()
[WinCap]::PrintWindow($handle, $hdc, 2) | Out-Null
$graphics.ReleaseHdc($hdc)

# PrintWindow can come back blank for accelerated webviews; fall back to the screen
# region only if the caller explicitly asks for it.
$allBlack = $true
for ($x = 0; $x -lt $width; $x += 40) {
  for ($y = 0; $y -lt $height; $y += 40) {
    $pixel = $bitmap.GetPixel($x, $y)
    if ($pixel.R + $pixel.G + $pixel.B -gt 20) { $allBlack = $false; break }
  }
  if (-not $allBlack) { break }
}
if ($allBlack -and $AllowScreenFallback) {
  $graphics.CopyFromScreen($left, $top, 0, 0, $bitmap.Size)
}

$graphics.Dispose()
$bitmap.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output "captured $width x $height -> $OutFile"
