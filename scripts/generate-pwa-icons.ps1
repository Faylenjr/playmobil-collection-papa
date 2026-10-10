param([string]$OutputDirectory = "public/icons")

Add-Type -AssemblyName System.Drawing
$resolved = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
[System.IO.Directory]::CreateDirectory($resolved) | Out-Null

function New-AppIcon([int]$Size, [string]$Name, [bool]$Maskable = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#06234a"))
  $margin = if ($Maskable) { [int]($Size * .16) } else { [int]($Size * .10) }
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $yellow = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#ffd43b"))
  $blue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#1685e8"))
  $navy = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#06234a"))
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#06234a"), [Math]::Max(4, $Size * .035))
  $graphics.FillRectangle($white, $margin, $margin, $Size - 2 * $margin, $Size - 2 * $margin)
  $graphics.FillRectangle($blue, $margin, [int]($Size * .29), $Size - 2 * $margin, [int]($Size * .14))
  $circle = [System.Drawing.Rectangle]::new([int]($Size * .27), [int]($Size * .34), [int]($Size * .46), [int]($Size * .46))
  $graphics.FillEllipse($yellow, $circle)
  $graphics.DrawEllipse($pen, $circle)
  $font = [System.Drawing.Font]::new("Arial", [single]($Size * .30), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBounds = [System.Drawing.RectangleF]::new($circle.X, $circle.Y, $circle.Width, $circle.Height)
  $graphics.DrawString("P", $font, $navy, $textBounds, $format)
  $bitmap.Save((Join-Path $resolved $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $font.Dispose(); $pen.Dispose(); $navy.Dispose(); $blue.Dispose(); $yellow.Dispose(); $white.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-AppIcon 192 "app-icon-192.png"
New-AppIcon 512 "app-icon-512.png"
New-AppIcon 512 "app-icon-maskable-512.png" $true
New-AppIcon 180 "apple-touch-icon.png"
