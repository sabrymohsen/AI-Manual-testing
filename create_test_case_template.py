import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.comments import Comment

def create_template():
    run_dir = os.path.expanduser("~/Desktop/AI-Manual-testing")
    os.makedirs(run_dir, exist_ok=True)

    wb = Workbook()

    # ────────────────────────────────────────────
    # 1. STYLES
    # ────────────────────────────────────────────
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=11, name="Calibri")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    required_fill = PatternFill(start_color="F4CCCC", end_color="F4CCCC", fill_type="solid")
    optional_fill = PatternFill(start_color="D9EAD3", end_color="D9EAD3", fill_type="solid")

    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin")
    )

    example_fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")

    # ────────────────────────────────────────────
    # 2. TEST CASES SHEET (Main Template)
    # ────────────────────────────────────────────
    ws = wb.active
    ws.title = "Test Cases"
    ws.sheet_view.showGridLines = False

    headers = [
        # (Column, Header, Required, Width, Description)
        ("A", "Test Case ID", True, 18, "Unique identifier (e.g., TC-001, TC-LOGIN-001). Must be unique across all test cases."),
        ("B", "Epic / Module", True, 20, "High-level feature or module this test belongs to (e.g., Login, Registration, Dashboard)."),
        ("C", "Feature / User Story", True, 24, "Specific feature or user story being tested (e.g., US-101: As a user, I want to log in)."),
        ("D", "Test Case Title", True, 35, "Short, descriptive title summarizing what this test validates."),
        ("E", "Test Description", False, 40, "Detailed description of what this test case is intended to verify."),
        ("F", "Pre-conditions", False, 40, "Setup steps or environment state required before executing the test."),
        ("G", "Test Steps", True, 50, "Numbered, step-by-step instructions to execute the test. Use new lines for each step."),
        ("H", "Expected Result", True, 50, "The exact outcome that should occur if the test passes."),
        ("I", "Test Data", False, 35, "Input data required for the test (e.g., username: test_user, password: Test@123)."),
        ("J", "Priority", True, 14, "Business impact of the test. Use: High / Medium / Low."),
        ("K", "Severity", False, 14, "Impact of failure if this test fails. Use: Critical / Major / Minor / Trivial."),
        ("L", "Test Type", True, 18, "Category of testing. Use: Functional / Regression / UI / API / Integration / E2E / Performance / Security / Usability / Accessibility / Smoke."),
        ("M", "Status", False, 14, "Current state. Use: Draft / Ready for Review / Approved / Deprecated."),
        ("N", "Environment", False, 20, "Target environment (e.g., Staging, Production, Local, Dev)."),
        ("O", "Automation Status", False, 18, "Automation state. Use: Manual / Automated / In Progress / Candidate."),
        ("P", "Tags / Labels", False, 25, "Comma-separated tags for filtering (e.g., smoke, regression, sprint-3)."),
        ("Q", "Assigned To", False, 20, "Person responsible for executing or maintaining this test case."),
        ("R", "Related Defects", False, 25, "Known bug IDs linked to this test (e.g., BUG-202, BUG-305)."),
        ("S", "Notes / Comments", False, 40, "Any additional context, assumptions, or known issues."),
    ]

    # Write header row
    for col, header, required, width, description in headers:
        cell = ws[f"{col}1"]
        cell.value = f"{header} {'(Required)' if required else '(Optional)'}"
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border
        cell.comment = Comment(description, "Template Guide")
        ws.column_dimensions[col].width = width

    ws.row_dimensions[1].height = 36

    # ────────────────────────────────────────────
    # 3. DATA VALIDATIONS (Dropdowns)
    # ────────────────────────────────────────────

    # Priority
    priority_dv = DataValidation(type="list", formula1='"High,Medium,Low"', allow_blank=True)
    priority_dv.error = "Please select from the dropdown: High, Medium, or Low."
    priority_dv.errorTitle = "Invalid Priority"
    priority_dv.prompt = "Select the test priority."
    priority_dv.promptTitle = "Priority"
    ws.add_data_validation(priority_dv)
    priority_dv.add("J2:J1000")

    # Severity
    severity_dv = DataValidation(type="list", formula1='"Critical,Major,Minor,Trivial"', allow_blank=True)
    severity_dv.error = "Please select from the dropdown."
    severity_dv.errorTitle = "Invalid Severity"
    ws.add_data_validation(severity_dv)
    severity_dv.add("K2:K1000")

    # Test Type
    test_type_dv = DataValidation(type="list", formula1='"Functional,Regression,UI,API,Integration,E2E,Performance,Security,Usability,Accessibility,Smoke"', allow_blank=True)
    test_type_dv.error = "Please select a valid test type from the dropdown."
    test_type_dv.errorTitle = "Invalid Test Type"
    ws.add_data_validation(test_type_dv)
    test_type_dv.add("L2:L1000")

    # Status
    status_dv = DataValidation(type="list", formula1='"Draft,Ready for Review,Approved,Deprecated"', allow_blank=True)
    status_dv.error = "Please select a valid status from the dropdown."
    status_dv.errorTitle = "Invalid Status"
    ws.add_data_validation(status_dv)
    status_dv.add("M2:M1000")

    # Automation Status
    auto_dv = DataValidation(type="list", formula1='"Manual,Automated,In Progress,Candidate"', allow_blank=True)
    auto_dv.error = "Please select a valid automation status from the dropdown."
    auto_dv.errorTitle = "Invalid Automation Status"
    ws.add_data_validation(auto_dv)
    auto_dv.add("O2:O1000")

    # ────────────────────────────────────────────
    # 4. EXAMPLE ROWS (Row 2-5) – marked as examples
    # ────────────────────────────────────────────
    examples = [
        [
            "TC-LOGIN-001",
            "Authentication",
            "US-101: User Login",
            "Verify successful login with valid credentials",
            "Validate that a registered user can log in with correct username and password.",
            "User is registered and account is active. System is accessible. Browser is supported.",
            "1. Navigate to the login page.\n2. Enter valid username in the 'Username' field.\n3. Enter valid password in the 'Password' field.\n4. Click the 'Login' button.",
            "User is redirected to the Dashboard. Welcome message 'Welcome back, [username]' is displayed. No error messages shown.",
            "Username: valid_user\nPassword: CorrectPass123!",
            "High",
            "Critical",
            "Functional",
            "Approved",
            "Staging",
            "Automated",
            "smoke, login, sprint-1",
            "Ahmed Hassan",
            "",
            "Covers the happy-path login scenario."
        ],
        [
            "TC-LOGIN-002",
            "Authentication",
            "US-101: User Login",
            "Verify login with incorrect password shows error",
            "Validate that entering an incorrect password displays a clear error and prevents access.",
            "User is registered and account is active.",
            "1. Navigate to the login page.\n2. Enter valid username.\n3. Enter incorrect password.\n4. Click 'Login'.",
            "Error message 'Invalid username or password' is displayed. User remains on the login page. No dashboard access.",
            "Username: valid_user\nPassword: WrongPass999",
            "High",
            "Major",
            "Functional",
            "Approved",
            "Staging",
            "Automated",
            "smoke, login, negative",
            "Ahmed Hassan",
            "",
            ""
        ],
        [
            "TC-REG-001",
            "User Registration",
            "US-102: New User Registration",
            "Verify successful registration with valid email and password",
            "Ensure a new user can create an account with all required fields filled correctly.",
            "User does not already exist in the system. Email is not in use.",
            "1. Navigate to the registration page.\n2. Enter a unique email.\n3. Enter a strong password (min 8 chars, 1 uppercase, 1 number, 1 special).\n4. Confirm password.\n5. Click 'Register'.",
            "Account is created successfully. Confirmation email is sent. User is redirected to the verification page.",
            "Email: new_user@example.com\nPassword: SecurePass1!",
            "High",
            "Critical",
            "Functional",
            "Draft",
            "Staging",
            "Manual",
            "registration, onboarding",
            "Sara Khaled",
            "",
            "Ensure email uniqueness is enforced at the DB level."
        ],
        [
            "TC-REG-002",
            "User Registration",
            "US-102: New User Registration",
            "Verify registration with already-used email shows error",
            "System should reject duplicate email registration and show an appropriate error.",
            "An existing account already uses the target email address.",
            "1. Navigate to the registration page.\n2. Enter an already registered email.\n3. Fill all other fields.\n4. Click 'Register'.",
            "Error message 'Email is already registered' is shown. No new account is created. No confirmation email sent.",
            "Email: existing_user@example.com",
            "Medium",
            "Major",
            "Functional",
            "Draft",
            "Staging",
            "Manual",
            "registration, negative",
            "Sara Khaled",
            "",
            ""
        ],
    ]

    for row_idx, example in enumerate(examples, start=2):
        for col_idx, value in enumerate(example, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.fill = example_fill
            cell.border = thin_border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        ws.row_dimensions[row_idx].height = 90

    # Add blank rows for user to start filling
    for r in range(6, 16):
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=r, column=col_idx)
            cell.border = thin_border
        ws.row_dimensions[r].height = 30

    # Freeze header row
    ws.freeze_panes = "A2"

    # Auto-filter on header row
    ws.auto_filter.ref = f"A1:{headers[-1][0]}1000"

    # ────────────────────────────────────────────
    # 5. INSTRUCTIONS SHEET
    # ────────────────────────────────────────────
    ws_instr = wb.create_sheet("📘 How to Use")
    ws_instr.sheet_view.showGridLines = False

    instructions = [
        ("How to Use This Test Case Template", True, 16),
        ("", False, 11),
        ("1. Filling in the Template", True, 12),
        ("   • Start adding your test cases from Row 6 (the first blank row after the yellow examples).", False, 11),
        ("   • Do NOT modify the yellow example rows (Rows 2-5). They are there for reference.", False, 11),
        ("   • Do NOT change the header row (Row 1) — the column names are required for the import system.", False, 11),
        ("   • Hover over any column header cell (Row 1) to see a tooltip explaining what that column is for.", False, 11),
        ("", False, 11),
        ("2. Required vs. Optional Columns", True, 12),
        ("   REQUIRED (marked with '(Required)' in the header):", False, 11),
        ("      - Test Case ID         → Must be unique across the entire file (e.g., TC-001, TC-LOGIN-002).", False, 11),
        ("      - Epic / Module        → The high-level feature group (e.g., Authentication, Payments, Dashboard).", False, 11),
        ("      - Feature / User Story → The specific feature or user story being tested.", False, 11),
        ("      - Test Case Title      → Short, clear, action-oriented title.", False, 11),
        ("      - Test Steps           → Numbered, step-by-step instructions. Use a new line for each step (Alt+Enter).", False, 11),
        ("      - Expected Result      → The exact expected outcome if the test passes.", False, 11),
        ("      - Priority             → Choose from the dropdown: High, Medium, or Low.", False, 11),
        ("      - Test Type            → Choose from the dropdown: Functional, Regression, UI, API, Integration, E2E, Performance, Security, Usability, Accessibility, Smoke.", False, 11),
        ("", False, 11),
        ("   OPTIONAL (marked with '(Optional)' in the header):", False, 11),
        ("      - Test Description, Pre-conditions, Test Data, Severity, Status, Environment, Automation Status, Tags, Assigned To, Related Defects, Notes.", False, 11),
        ("", False, 11),
        ("3. Data Validation (Dropdowns)", True, 12),
        ("   • Columns with dropdowns enforce valid values. If you type an invalid value, you will see an error message.", False, 11),
        ("   • Dropdown columns: Priority, Severity, Test Type, Status, Automation Status.", False, 11),
        ("   • You can also type values directly as long as they match the allowed options exactly (case-sensitive).", False, 11),
        ("", False, 11),
        ("4. Best Practices", True, 12),
        ("   ✓ Use a consistent naming convention for Test Case IDs (e.g., TC-<MODULE>-###).", False, 11),
        ("   ✓ Keep Test Steps concise but complete. One step = one action.", False, 11),
        ("   ✓ Expected Result should be testable and verifiable (e.g., 'Page loads within 2 seconds' not 'Page should be fast').", False, 11),
        ("   ✓ Test Data should be realistic and production-like. Never use real credentials.", False, 11),
        ("   ✓ Use Alt+Enter in Excel to create multi-line text within a single cell.", False, 11),
        ("   ✓ Separate tags with commas (no spaces before/after each tag is recommended).", False, 11),
        ("   ✓ Save the file as .xlsx (Excel format) before uploading. Do not use .csv for imports with multi-line text.", False, 11),
        ("", False, 11),
        ("5. Before Uploading", True, 12),
        ("   1. Ensure all required fields (marked with 'Required' in the header) are filled for every row.", False, 11),
        ("   2. Ensure all Test Case IDs are unique — duplicates will cause import errors.", False, 11),
        ("   3. Ensure dropdown values are selected from the allowed list (check for typos).", False, 11),
        ("   4. Remove the example rows (Rows 2-5) if you don't want them imported.", False, 11),
        ("   5. Save the file as .xlsx format (not .csv or .xls).", False, 11),
        ("", False, 11),
        ("6. Need Help?", True, 12),
        ("   If you encounter any issues during upload, please contact the QA team with the error message.", False, 11),
    ]

    for row_idx, (text, is_bold, font_size) in enumerate(instructions, start=1):
        cell = ws_instr.cell(row=row_idx, column=1, value=text)
        cell.font = Font(bold=is_bold, size=font_size, name="Calibri", color="1F4E79" if is_bold else "000000")
        cell.alignment = Alignment(vertical="top", wrap_text=True)

    ws_instr.column_dimensions["A"].width = 110

    # ────────────────────────────────────────────
    # 6. FIELD REFERENCE SHEET (Quick lookup)
    # ────────────────────────────────────────────
    ws_ref = wb.create_sheet("📋 Field Reference")
    ws_ref.sheet_view.showGridLines = False

    ref_headers = ["Column", "Field Name", "Required?", "Data Type", "Allowed Values", "Max Length", "Description"]
    ref_data = [
        ["A", "Test Case ID", "Yes", "Text", "Any unique ID (e.g., TC-001)", "50", "Unique identifier for the test case."],
        ["B", "Epic / Module", "Yes", "Text", "Any module name", "100", "High-level feature group."],
        ["C", "Feature / User Story", "Yes", "Text", "Any feature name", "100", "Specific feature or user story being tested."],
        ["D", "Test Case Title", "Yes", "Text", "Any descriptive title", "200", "Short, clear summary of the test."],
        ["E", "Test Description", "No", "Text", "Free text", "2000", "Detailed description of what is being tested."],
        ["F", "Pre-conditions", "No", "Text", "Free text", "2000", "Setup required before executing the test."],
        ["G", "Test Steps", "Yes", "Text", "Numbered steps, use Alt+Enter for new lines", "4000", "Step-by-step instructions to execute the test."],
        ["H", "Expected Result", "Yes", "Text", "Free text", "4000", "Exact outcome that should occur."],
        ["I", "Test Data", "No", "Text", "Free text", "2000", "Input data required for the test."],
        ["J", "Priority", "Yes", "Dropdown", "High, Medium, Low", "-", "Business impact of the test."],
        ["K", "Severity", "No", "Dropdown", "Critical, Major, Minor, Trivial", "-", "Impact if this test fails."],
        ["L", "Test Type", "Yes", "Dropdown", "Functional, Regression, UI, API, Integration, E2E, Performance, Security, Usability, Accessibility, Smoke", "-", "Category of testing."],
        ["M", "Status", "No", "Dropdown", "Draft, Ready for Review, Approved, Deprecated", "-", "Current state of the test case."],
        ["N", "Environment", "No", "Text", "Staging, Production, Local, Dev", "100", "Target environment for execution."],
        ["O", "Automation Status", "No", "Dropdown", "Manual, Automated, In Progress, Candidate", "-", "Automation state of the test."],
        ["P", "Tags / Labels", "No", "Text", "Comma-separated tags", "200", "Tags for filtering and grouping."],
        ["Q", "Assigned To", "No", "Text", "Person name", "100", "Responsible team member."],
        ["R", "Related Defects", "No", "Text", "Comma-separated bug IDs", "200", "Linked defect IDs."],
        ["S", "Notes / Comments", "No", "Text", "Free text", "2000", "Additional context or assumptions."],
    ]

    # Header row
    for col_idx, header in enumerate(ref_headers, start=1):
        cell = ws_ref.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_alignment
        cell.border = thin_border

    # Data rows
    for row_idx, row_data in enumerate(ref_data, start=2):
        for col_idx, value in enumerate(row_data, start=1):
            cell = ws_ref.cell(row=row_idx, column=col_idx, value=value)
            cell.border = thin_border
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if col_idx == 3:
                if value == "Yes":
                    cell.fill = required_fill
                else:
                    cell.fill = optional_fill

    # Adjust column widths
    ws_ref.column_dimensions["A"].width = 8
    ws_ref.column_dimensions["B"].width = 22
    ws_ref.column_dimensions["C"].width = 12
    ws_ref.column_dimensions["D"].width = 12
    ws_ref.column_dimensions["E"].width = 45
    ws_ref.column_dimensions["F"].width = 12
    ws_ref.column_dimensions["G"].width = 55

    ws_ref.freeze_panes = "A2"
    ws_ref.auto_filter.ref = "A1:G20"

    # ────────────────────────────────────────────
    # 7. SAVE FILE
    # ────────────────────────────────────────────
    output_path = os.path.join(run_dir, "Test_Case_Import_Template.xlsx")
    wb.save(output_path)
    print(f"Template saved to: {output_path}")
    print(f"File size: {os.path.getsize(output_path)} bytes")

    return output_path

if __name__ == "__main__":
    create_template()
