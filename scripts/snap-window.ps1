param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [ValidateSet("left", "right")][string]$Side = "right"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinSnap {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
}
"@

[WinSnap]::SetProcessDPIAware() | Out-Null

$proc = Get-Process -Id $ProcessId -ErrorAction Stop
$handle = $proc.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw "No main window handle for process $ProcessId" }

# SW_SHOWNOACTIVATE keeps the restore from pulling focus.
if ([WinSnap]::IsZoomed($handle)) {
  [WinSnap]::ShowWindow($handle, 4) | Out-Null
  Start-Sleep -Milliseconds 250
}

$area = [System.Windows.Forms.Screen]::FromHandle($handle).WorkingArea
$half = [int]($area.Width / 2)
$x = if ($Side -eq "right") { $area.X + $half } else { $area.X }

# SWP_NOZORDER (0x4) | SWP_NOACTIVATE (0x10)
[WinSnap]::SetWindowPos($handle, [IntPtr]::Zero, $x, $area.Y, $half, $area.Height, 0x14) | Out-Null

Write-Output "snapped $Side half: ${half}x$($area.Height) at $x,$($area.Y)"
