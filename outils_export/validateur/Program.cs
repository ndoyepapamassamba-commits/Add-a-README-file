using DocumentFormat.OpenXml.Packaging; using DocumentFormat.OpenXml.Validation; using DocumentFormat.OpenXml;
foreach(var f in args){ try{ OpenXmlPackage d = f.EndsWith(".docx")?WordprocessingDocument.Open(f,false):f.EndsWith(".pptx")?PresentationDocument.Open(f,false):SpreadsheetDocument.Open(f,false);
  var v=new OpenXmlValidator(FileFormatVersions.Office2016); int n=0;
  foreach(var e in v.Validate(d)){ if(n++<25) Console.WriteLine($"{Path.GetFileName(f)} | {e.Part?.Uri} | {e.Path?.XPath} | {e.Description}"); } Console.WriteLine($"{Path.GetFileName(f)}: {n} erreur(s)"); d.Dispose(); }catch(Exception ex){ Console.WriteLine(f+" EXC "+ex.Message); } }
