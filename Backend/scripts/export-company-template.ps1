param(
  [string]$InputPath = "$PSScriptRoot\..\..\dist\company-template\base.xlsx",
  [string]$OutputDirectory = "$PSScriptRoot\..\..\dist\company-template",
  [string]$PdfName = 'base.pdf',
  [switch]$SkipGeometry
)
$ErrorActionPreference = 'Stop'
$inputFile = (Resolve-Path -LiteralPath $InputPath).Path
$outputFolder = (Resolve-Path -LiteralPath $OutputDirectory).Path
$excelInstance = $null
$workbook = $null
try {
  $excelInstance = New-Object -ComObject Excel.Application
  $excelInstance.Visible = $false
  $excelInstance.DisplayAlerts = $false
  $excelInstance.AutomationSecurity = 3
  $workbook = $excelInstance.Workbooks.Open($inputFile, 0, $true)
  $sheet = $workbook.Worksheets.Item(1)
  $workbook.ExportAsFixedFormat(0, (Join-Path $outputFolder $PdfName))
  if ($SkipGeometry) { Write-Output "Impressão conferida pelo Excel: $PdfName"; return }
  $area = $sheet.Range('A2:O40')
  $cells = @{}
  foreach ($address in @('B6:D7', 'F6:F7', 'B8:F9', 'B10:D12', 'F10:F12', 'A17:F17', 'A21:A21', 'B21:B21', 'C21:D21', 'E21:E21', 'F21:G21', 'H21:H21', 'I21:J21', 'K21:L21', 'M21:M21', 'N21:O21')) {
    $range = $sheet.Range($address)
    $cells[$address] = @{
      x = [double]($range.Left - $area.Left); y = [double]($range.Top - $area.Top)
      width = [double]$range.Width; height = [double]$range.Height
    }
  }
  $geometry = @{ width = [double]$area.Width; height = [double]$area.Height; cells = $cells }
  [IO.File]::WriteAllText((Join-Path $outputFolder 'geometry.json'), ($geometry | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
  Write-Output "PDF e geometria exportados pelo Excel: $outputFolder"
} finally {
  if ($null -ne $workbook) { $workbook.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($workbook) }
  if ($null -ne $excelInstance) { $excelInstance.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelInstance) }
}
