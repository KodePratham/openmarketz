import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ReportConfig = {
  id: string;
  title: string;
  fileName: string;
};

type LoadedReport = ReportConfig & {
  content: string | null;
};

const REPORTS: ReportConfig[] = [
  {
    id: "localnet-base",
    title: "Localnet 10-account simulation",
    fileName: "openmarketz-amm-localnet-report.md",
  },
  {
    id: "localnet-high-deposit",
    title: "Localnet high-deposit simulation (10-100 USDC)",
    fileName: "openmarketz-amm-localnet-high-deposit-report.md",
  },
];

async function loadReport(fileName: string): Promise<string | null> {
  const reportPath = path.resolve(process.cwd(), "src", "content", "test-runs", fileName);
  try {
    return await fs.readFile(reportPath, "utf8");
  } catch {
    return null;
  }
}

export default async function TestRunsPage() {
  const loadedReports: LoadedReport[] = await Promise.all(
    REPORTS.map(async (report) => ({
      ...report,
      content: await loadReport(report.fileName),
    }))
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="shell-card gum-hero p-6 sm:p-10">
        <p className="gum-kicker">OpenMarketz</p>
        <h1 className="font-display mt-3 text-4xl font-black leading-tight sm:text-6xl">Test Runs</h1>
        <p className="mt-4 max-w-3xl text-base text-white">
          These are rendered AMM localnet reports. Frontend remains on Sepolia until Monad testnet is fixed.
          For support, message {" "}
          <a
            href="https://twitter.com/prathamkode"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            @prathamkode
          </a>
          .
        </p>
        <div className="mt-6">
          <Link href="/" className="ghost-button inline-flex px-5 py-2.5 text-sm">
            Back Home
          </Link>
        </div>
      </header>

      {loadedReports.map((report) => (
        <section key={report.id} className="shell-card gum-panel p-4 sm:p-6">
          <h2 className="font-display text-2xl font-black">{report.title}</h2>
          {!report.content ? (
            <p className="text-muted mt-3 text-sm">Report file missing: src/content/test-runs/{report.fileName}</p>
          ) : (
            <div className="report-markdown mt-4 overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.content}</ReactMarkdown>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}
