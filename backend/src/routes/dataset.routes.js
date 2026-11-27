const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();
const projectRoot = path.resolve(__dirname, "../../..");
const uploadsDir = path.join(projectRoot, "processing-engine/data/uploads");
const outputRoot = path.join(projectRoot, "processing-engine/data/output");
const pythonPath = process.env.DATASET_PYTHON || path.join(projectRoot, "processing-engine/venv/bin/python");
const processorPath = path.join(projectRoot, "processing-engine/engine/processor.py");
const generatedFiles = [
  "cleaned.csv",
  "train.csv",
  "validation.csv",
  "test.csv",
  "schema.json",
  "metadata.json",
  "preprocessing_report.json",
  "data_quality_issues.csv",
  "rejected_rows.csv",
];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

fs.mkdirSync(uploadsDir, { recursive: true });
router.use(adminAuth);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID() + ".csv"),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== ".csv") {
      return callback(new Error("Only CSV files are allowed."));
    }
    callback(null, true);
  },
});

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function datasetResults(directory) {
  return {
    metadata: readJson(path.join(directory, "metadata.json")),
    schema: readJson(path.join(directory, "schema.json")),
    report: readJson(path.join(directory, "preprocessing_report.json")),
  };
}

router.post("/upload", (req, res) => {
  upload.single("file")(req, res, (uploadError) => {
    if (uploadError) {
      const status = uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ success: false, message: uploadError.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please upload a CSV file." });
    }

    const jobId = crypto.randomUUID();
    const outputDir = path.join(outputRoot, jobId);
    const cleanedPath = path.join(outputDir, "cleaned.csv");

    execFile(
      pythonPath,
      [processorPath, req.file.path, cleanedPath],
      { cwd: projectRoot, timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        fs.unlink(req.file.path, () => {});
        if (error) {
          console.error("Dataset processing failed:", stderr || error.message);
          return res.status(500).json({
            success: false,
            message: "Dataset processing failed. Check that the CSV has valid tabular data.",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Dataset uploaded and processed successfully.",
          jobId,
          generatedFiles,
          results: datasetResults(outputDir),
        });
      }
    );
  });
});

router.get("/:jobId/files/:filename", (req, res) => {
  const { jobId, filename } = req.params;
  if (!uuidPattern.test(jobId) || !generatedFiles.includes(filename)) {
    return res.status(404).json({ success: false, message: "Dataset file not found." });
  }

  const directory = path.resolve(outputRoot, jobId);
  const filePath = path.resolve(directory, filename);
  if (path.dirname(filePath) !== directory || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "Dataset file not found." });
  }

  res.download(filePath, filename, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ success: false, message: "Dataset file not found." });
    }
  });
});

router.get("/:jobId", (req, res) => {
  if (!uuidPattern.test(req.params.jobId)) {
    return res.status(404).json({ success: false, message: "Dataset job not found." });
  }

  const directory = path.resolve(outputRoot, req.params.jobId);
  const results = datasetResults(directory);
  if (!results.metadata) {
    return res.status(404).json({ success: false, message: "Dataset job not found." });
  }

  return res.json({
    success: true,
    jobId: req.params.jobId,
    generatedFiles: generatedFiles.filter((name) => fs.existsSync(path.join(directory, name))),
    results,
  });
});

module.exports = router;
