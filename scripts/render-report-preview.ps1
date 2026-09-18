$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $book = $excel.Workbooks.Open((Join-Path $root 'tmp/report-preview.xlsx'))
  try {
    foreach ($name in @('Muka Depan', 'Pengesahan')) {
      $sheet = $book.Worksheets.Item($name)
      $file = if ($name -eq 'Muka Depan') { 'cover-preview.pdf' } else { 'annual-preview.pdf' }
      $sheet.ExportAsFixedFormat(0, (Join-Path $root "tmp/$file"))
    }
  } finally { $book.Close($false) }
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
