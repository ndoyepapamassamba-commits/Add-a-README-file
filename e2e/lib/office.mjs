// Page counts of downloaded documents: PDF files directly, Word (.doc) files through LibreOffice when installed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Pages of a PDF (jsPDF and LibreOffice both write one uncompressed "/Type /Page" dictionary per page). */
export function pdfPageCount(bytes) {
  return (bytes.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

/**
 * Converts a .doc file with LibreOffice (as a customer without Microsoft Word would open it) and returns its
 * page count, or null when LibreOffice is not installed.
 */
export function libreOfficePages(docFile, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  try {
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, docFile], { stdio: "ignore", timeout: 120_000 });
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  const pdf = path.join(outDir, path.basename(docFile).replace(/\.doc$/, ".pdf"));
  return pdfPageCount(fs.readFileSync(pdf));
}

/**
 * Opens a workbook with LibreOffice headless (converted to PDF, as a buyer without Excel would print it).
 * Returns true when a non-empty PDF came out, false otherwise, null when LibreOffice is not installed.
 */
export function libreOfficeOpens(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const pdf = path.join(outDir, path.basename(file).replace(/\.[^.]+$/, ".pdf"));
  fs.rmSync(pdf, { force: true });
  try {
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", outDir, file], { stdio: "ignore", timeout: 120_000 });
  } catch (err) {
    if (err.code === "ENOENT") return null;
    return false;
  }
  return fs.existsSync(pdf) && pdfPageCount(fs.readFileSync(pdf)) >= 1;
}
