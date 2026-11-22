package qa.pipeline;

import com.aventstack.extentreports.ExtentReports;
import com.aventstack.extentreports.ExtentTest;
import com.aventstack.extentreports.Status;
import com.aventstack.extentreports.reporter.ExtentSparkReporter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Reads results.json (written by record_result.js) and writes an ExtentReports Spark report.
 * It reports; it never re-runs or re-judges a test. Statuses map without merging:
 * Passed -> PASS, Failed -> FAIL, Error -> WARNING (labelled ERROR), Flaky -> WARNING (labelled FLAKY),
 * Blocked / Skipped / Not Run -> SKIP (labelled with the real status).
 * Usage: ExtentFromResults <results.json> <out dir>
 */
public final class ExtentFromResults {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: ExtentFromResults <results.json> <out dir>");
            System.exit(2);
        }
        File resultsFile = new File(args[0]);
        Path outDir = Path.of(args[1]);
        Files.createDirectories(outDir.resolve("evidence"));
        JsonNode run = new ObjectMapper().readTree(resultsFile);
        if (!"complete".equals(run.path("status").asText())) {
            System.err.println("The run is not complete. Finish and validate it first.");
            System.exit(1);
        }

        ExtentSparkReporter spark = new ExtentSparkReporter(outDir.resolve("index.html").toFile());
        String title = run.path("storyId").asText() + " " + run.path("storyTitle").asText();
        spark.config().setDocumentTitle(title);
        spark.config().setReportName((run.path("sample").asBoolean() ? "SAMPLE - " : "")
                + (run.path("override").asBoolean() ? "TESTER OVERRIDE - " : "") + title);
        ExtentReports extent = new ExtentReports();
        extent.attachReporter(spark);
        extent.setSystemInfo("Base URL", run.path("baseUrl").asText());
        extent.setSystemInfo("Tool", "Playwright agent-cli (no automation code)");
        extent.setSystemInfo("Session", run.path("session").asText());
        extent.setSystemInfo("Suite", run.path("suiteId").asText());

        Path resultsDir = resultsFile.getAbsoluteFile().getParentFile().toPath();
        for (JsonNode r : run.path("results")) {
            String status = r.path("status").asText();
            ExtentTest t = extent.createTest(r.path("id").asText() + " " + r.path("title").asText());
            t.assignCategory(r.path("scope").asText("Target"));
            if (!r.path("priority").isMissingNode()) t.assignCategory(r.path("priority").asText());
            for (JsonNode s : r.path("steps")) {
                String detail = "Step " + s.path("n").asInt() + ": " + s.path("action").asText()
                        + "<br>Expected: " + esc(s.path("expected").asText())
                        + "<br>Actual: " + esc(s.path("actual").asText());
                Status st = switch (s.path("status").asText()) {
                    case "pass" -> Status.PASS;
                    case "fail" -> Status.FAIL;
                    case "error" -> Status.WARNING;
                    default -> Status.SKIP;
                };
                t.log(st, detail);
                String shot = s.path("screenshot").asText(null);
                if (shot != null && !shot.isEmpty()) {
                    Path src = resultsDir.resolve(shot);
                    if (Files.exists(src)) {
                        Path dst = outDir.resolve("evidence").resolve(src.getFileName());
                        Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
                        t.addScreenCaptureFromPath("evidence/" + src.getFileName());
                    }
                }
            }
            String reason = r.path("reason").asText("");
            switch (status) {
                case "Passed" -> t.pass("Passed");
                case "Failed" -> t.fail("Failed: an assertion did not hold");
                case "Error" -> t.warning("ERROR (could not run as designed): " + esc(reason));
                case "Flaky" -> t.warning("FLAKY: passed only on the single retry after an infrastructure error");
                default -> t.skip(status.toUpperCase() + (reason.isEmpty() ? "" : ": " + esc(reason)));
            }
        }
        extent.flush();
        System.out.println("Extent report written: " + outDir.resolve("index.html"));
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
