# BiomechBase App Summary

## 1. Project Overview
BiomechBase is a dual-end clinical data platform with:
- A web application (React + Vite) for full data management and analysis
- A WeChat Mini Program for lightweight/mobile workflows
- A shared backend API (Node.js + Express)

Both clients operate on the same subject/protocol data model and call the same `/api` endpoints.

---

## 2. Main Applications

### 2.1 Web App (Primary Console)
**Purpose**
- Full-featured subject data management
- Study protocol management
- Role-based access and permission-aware UI
- Descriptive and inferential statistics

**Core Capabilities**
- Authentication and session handling
- Subject CRUD + soft delete/recycle bin + restore/hard delete
- CSV template download/import/export
- Database backup/restore (admin tier controls)
- Selection-based cohort filtering and exports
- Statistical dashboard and inferential module

**Tech Stack**
- React + TypeScript
- Vite
- Recharts for dashboard visualization

### 2.2 WeChat Mini Program (Mobile MVP)
**Purpose**
- Mobile access to key workflows
- Fast operations for login, browsing, and basic editing

**Core Capabilities**
- Login/logout
- Subject list + create/edit
- Study protocol list + create/edit
- Recycle-bin toggle + restore/delete
- Basic KPI recomputation (total/consented/excluded/completeness)

**Tech Stack**
- Native WeChat Mini Program framework (`wx` APIs)
- Shared backend API access through `miniapp/utils/request.js`

### 2.3 Backend API (Shared Service)
**Purpose**
- Single source of truth for both web and mini app
- Authentication, authorization, data persistence, and validation

**Core Capabilities**
- Auth endpoints (login/logout/register/session checks)
- Subject and protocol CRUD
- Soft delete/recovery/version conflict handling
- File payload validation (PDF/JPEG/PNG)
- Backup export/import endpoints

**Tech Stack**
- Node.js
- Express
- JSON file persistence (`server/db.json`)

---

## 3. Statistics Mainstream (Current Code)

## 3.1 Descriptive Statistics (Selected Subjects)
For each numeric measure (height, mass, BMI, limb metrics, etc.), the app computes:
- N
- Mean
- Standard Deviation (SD)
- Interquartile Range (IQR)
- 95% quantile range low/high (2.5th and 97.5th percentile)

## 3.2 Inferential Statistics Decision Flow
The inferential module dynamically chooses tests by comparison mode and normality:

1. Build groups from selected subjects (or all non-deleted subjects if none selected)
2. Determine mode:
   - `independent-2`: 2 independent groups
   - `anova`: >2 independent groups
   - `paired-2`: 2 matched groups (by pair key)
   - `repeated`: >2 matched conditions
3. Test normality using Jarque-Bera (`p > 0.05` treated as normal)
4. Select tests:
   - Independent 2 groups:
     - normal -> Independent t-test
     - non-normal -> Mann-Whitney U
   - Independent >2 groups:
     - normal -> One-way ANOVA
     - non-normal -> Kruskal-Wallis
   - Paired 2 groups:
     - normal differences -> Paired t-test
     - non-normal differences -> Wilcoxon signed-rank
   - Repeated >2 conditions:
     - normal per condition -> One-way repeated-measures ANOVA
     - non-normal -> Friedman test

## 3.3 Reported Inferential Outputs
Per measure, the module outputs:
- Sample size (N)
- Normality p-value
- Test name
- Statistic (t, U, F, H, W, Q)
- Degrees of freedom (if applicable)
- p-value
- Power (available for parametric tests; nonparametric branches output NaN/blank)
- Notes for insufficient data or matching issues

---

## 4. Data and Access Model

### 4.1 Roles
- Admin (tiered privileges)
- Researcher
- Visitor (read-only)

### 4.2 Subject Data Scope
- Identity/contact (permission-gated)
- Demographics and anthropometrics
- Clinical status and consent flags
- Versioned metadata with history and soft delete support

### 4.3 Protocol Data Scope
- Study protocol metadata
- Ethical approval file payloads
- Version and history metadata

---

## 5. Runtime and Deployment Notes
- Backend runtime required: **Node.js only**
- No Java/Python backend services are required by the current code
- Web and mini app both depend on backend API availability
- Production mini app requires HTTPS and approved request domain in WeChat settings

---

## 6. Recommended Use Pattern
1. Run backend API first
2. Run web app for full operations, admin tools, and inferential analysis
3. Use mini app for mobile operational workflows
4. Export descriptive/inferential CSV outputs for downstream reporting
