using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;
using DocumentFormat.OpenXml;
foreach (var path in args) {
  Console.WriteLine($"== {System.IO.Path.GetFileName(path)}");
  try {
    OpenXmlPackage doc = path.EndsWith(".docx") ? WordprocessingDocument.Open(path, false) : path.EndsWith(".pptx") ? PresentationDocument.Open(path, false) : SpreadsheetDocument.Open(path, false);
    var v = new OpenXmlValidator(FileFormatVersions.Office2016);
    int n = 0;
    foreach (var e in v.Validate(doc)) {
      if (n++ < 100000) Console.WriteLine($"  [{e.ErrorType}] {e.Part?.Uri} {e.Path?.XPath} :: {e.Description}");
    }
    Console.WriteLine($"  {n} error(s)");
  } catch (Exception ex) { Console.WriteLine($"  OPEN FAILED: {ex.GetType().Name}: {ex.Message}"); }
}
