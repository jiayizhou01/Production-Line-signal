# Production Line Signal

Manufacturing Operations Dashboard for Lean Improvement

English ｜ [中文](./README.md)

A lightweight production data management and improvement analysis platform for lean improvement engineers and production operations staff. It is designed for manufacturing sites that cannot yet ingest real-time MES, equipment, or IoT data, and instead rely on manual entry and browser-local data, with record export and local backup support.

## 1. Overview

The platform consolidates a workflow that typically lives on paper daily reports, spreadsheets, and verbal communication — shift production data, product output, labor input, line-stop anomalies, and improvement priorities — into a closed loop that can be entered, computed, drilled into, and exported. The cockpit summarizes the most recent complete production day and flags risks; efficiency analysis covers trends and labor productivity; anomaly management locates downtime losses; and daily reports preserve the raw data that every drill-down lands on.

This is not a real-time MES and not an ERP. It is an operations workbench that first unifies metric definitions where no system exists, then supports improvement decisions.

## 2. Background

This project originates from production management and lean improvement needs at a manufacturing site without MES coverage. The original process relied on paper daily reports, manual spreadsheet statistics, and shift briefings. The core problem was not "no data" but "no stable relationships between data": output, labor, and time for the same shift could be double-counted; day-shift and night-shift metrics were averaged naively; planned downtime and unplanned stoppages were mixed together; and overlapping anomalies accumulated duplicated stop time.

The author first mapped the business objects, metric definitions, and page information architecture (distilled from field work into a mind map and data model), then implemented the platform step by step. The project has not been deployed in any enterprise; the data shown in the UI is demo data.

## 3. Use Cases

- Manufacturing sites without MES, or where MES does not reach shop-floor data collection;
- Production operations and lean improvement roles that rely on manual daily reports and spreadsheet consolidation;
- Improvement engineers who need unified OEE / UPPH / yield definitions and fast downtime-loss localization.

## 4. Core Features

- **Latest-complete-production-day cockpit**: key metrics for the most recent complete production day (normally yesterday; falls back to the latest day with data when yesterday has no entries), per-line risk grading (normal / watch / abnormal), and a focused risk panel (largest-loss line, largest-loss type, most-affected station);
- **Daily production report**: raw data entry keyed by date × line × shift, with edit and delete support (delete requires double confirmation) and derived metrics computed automatically;
- **Multi-model product details**: multiple product models produced in the same shift are kept as details of a single report, never split into separate reports;
- **Efficiency analysis**: CT, attainment, OEE, UPPH, and yield trends with period comparison and drill-down to specific daily reports;
- **Labor analysis**: actual attended hours, theoretical staffing hours, standard earned hours, and labor efficiency;
- **Anomaly registration and analysis**: anomaly type, station, responsible department, and stop duration, with delete support (double confirmation) and rankings by type and station;
- **Anomaly recurrence alerts**: identifies anomalies that repeatedly occur at the same station with the same type;
- **Cross-page drill-down with URL context**: navigation among cockpit, efficiency analysis, anomaly analysis, and daily reports preserves date / line / shift / metric context in the URL;
- **Reference data management**: in-place create and edit of lines, product models (with optional default CT), stations, responsible departments, and anomaly types, built into the daily report and anomaly registration pages;
- **Data export**: daily reports and anomaly records as UTF-8 BOM CSV (opens directly in Excel), with a choice of exporting the current filtered view or all data;
- **Rule-based AI assistant**: answers common analysis questions from the unified data store, attaching clickable evidence (production reports, anomaly records, and metric references) to every conclusion, clearly reporting insufficient data, and marking deleted source records as such instead of fabricating answers;
- **AI conversation management**: clearing demo data removes only the conversation turns based on demo data, keeping conversations whose context includes manual records; "clear conversation history" is a separate action that deletes all local AI conversations after confirmation without touching any reports, anomalies, or reference data.

## 5. Core Business Rules

1. Only one daily report may exist per date × line × shift (enforced at the repository layer);
2. Multi-model production is kept as product details of a single report, so time and labor are never double-counted per model;
3. CT is weighted by good output; ratios and CT values are never naively averaged;
4. Daily OEE, UPPH, attainment, and yield are always re-aggregated from base quantities and hours, never averaged from shift-level metrics;
5. Planned downtime (inspection, 5S, scheduled maintenance) and anomaly stoppages are tracked separately;
6. Total anomaly stop time, station downtime rankings, and OEE impact use interval-merged deduplicated stop time; anomaly-type accumulated downtime uses raw registered durations to preserve type attribution, which is not equal to the deduplicated line total; cross-shift anomalies are split at shift boundaries and attributed to the correct working day;
7. Available line time does not subtract anomaly stop time; anomaly losses are tracked separately.

## 6. Metric Definitions

| Metric | Definition |
| --- | --- |
| Good output (actual inbound) | actual offline output − defect quantity |
| Weighted CT | Σ(good output per model × CT) ÷ Σ good output |
| Attainment rate | Σ actual output ÷ Σ planned output |
| Yield rate | Σ good output ÷ Σ actual output |
| OEE | Σ(good output × CT) ÷ Σ calendar open hours (simplified; not the full three-factor OEE) |
| UPPH | Σ good output ÷ Σ actual attended hours |
| Calendar open hours | shift hours − meal break |
| Available line hours | calendar open hours − planned downtime |
| Actual attended hours | actual operators × available line hours |
| Theoretical staffing hours | standard staffing × available line hours |
| Standard earned hours | Σ(good output per model × CT × line standard staffing), CT in hours |
| Total stop time | planned downtime + deduplicated anomaly stop time |

## 7. Data Architecture

- React global store: all pages share a single data source;
- Repository layer: isolates persistence details and enforces the daily-report uniqueness constraint;
- IndexedDB persistence: data stays in the visitor's browser;
- Unified KPI service: the cockpit, efficiency analysis, daily reports, export, and AI assistant references all share one computation path;
- Mock data is an optional seed that users explicitly load or clear from the sidebar; a new browser database starts without demo business records or preconfigured lines, models, stations, departments, or anomaly types. Reference data can be created and edited next to the related fields in the existing daily-report and anomaly forms.

## 8. Tech Stack

React, TypeScript, Vite, Tailwind CSS, ECharts, React Router, IndexedDB. No backend service.

## 9. Development Approach

The business scenario mapping, manufacturing metric definitions, product logic, page structure, and acceptance criteria are owned by the author. Code implementation was assisted by AI programming tools for implementation, debugging, prototyping, and documentation. Key business rules, metric definitions, and final acceptance were judged by the author, and definition errors in AI-generated code (such as naive averaging of ratios and duplicated stop time) were caught and corrected during acceptance. This project is a complete practice of "business modeling owned by a human, implementation accelerated by AI" — not an AI-generated product.

## 10. Running Locally

Requirements:

- Node.js 22.13+
- pnpm 11.17.0
- This release has been verified with Node.js v24.18.0 and pnpm 11.17.0.

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

Then open http://localhost:5173 . The app starts without business records or business reference data. Create your own lines, models, stations, departments, and anomaly types next to their related fields in the daily-report and anomaly forms, or use **Load demo data** in the lower-left sidebar to explore the complete workflow. Use the same control again to remove demo records without deleting manually entered data.

## 11. Verification

```bash
pnpm run verify:data
pnpm run verify:demo
pnpm run verify:ai-context
pnpm run build
```

## 12. Online Demo

To be deployed. A link will be added here once deployed.

Deployment note: this repository ships a Vercel SPA routing fallback (vercel.json) so direct visits and refreshes of sub-routes do not 404; other static hosting platforms need an equivalent index.html fallback rule.

## 13. Demo Data

The platform includes optional demo data (lines, product models, stations, and anomaly records are fictional). It demonstrates the business loop and metric definitions only and does not represent the performance of any real factory. Demo records are never inserted automatically on first run and can be loaded or cleared from the lower-left sidebar. Clearing removes only `dataSource=seed` business records and demo reference values that are not referenced by manual records.

## 14. Persistence and Backup

All data is stored in the visitor's own browser IndexedDB and is never uploaded. Clearing browser data, switching browsers, or switching devices will lose the data. Use the built-in backup feature to export important data first.

## 15. Current Limitations

- No real multi-user collaboration yet;
- No backend database; data lives only in the browser;
- Not yet connected to MES, ERP, IoT, or equipment real-time data;
- The AI assistant is rule-based analysis and is not connected to an LLM API;
- The UI is currently Chinese-first; bilingual READMEs are provided but the interface has no language switch yet.

## 16. Roadmap

- Backend service and database, with authentication, permissions, and auditing;
- Multi-user collaboration and role control;
- MES, ERP, and IoT data integration;
- Fuller backup and restore;
- Interface internationalization;
- This public repository will serve as the main development repository with ongoing incremental commits.

## 17. License

This project is provided under the PolyForm Noncommercial License 1.0.0. It is source-available, not an OSI open-source license.

- Personal study, research, testing, and other purposes permitted by the license are allowed;
- Companies and individuals may not use this project directly for commercial operation, paid services, commercial delivery, or other commercial purposes;
- Commercial use requires written authorization from the copyright holder, reachable via GitHub Issues;
- Rights and obligations are governed by [LICENSE](./LICENSE); this section is not legal advice.

## 18. Disclaimer

This project is provided "as is" for technical exchange and learning. The author is not liable for any direct or indirect consequences arising from its use. All demo data is fictional and does not represent any real factory.
