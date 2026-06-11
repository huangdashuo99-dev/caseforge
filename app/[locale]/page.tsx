"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

interface TestCase {
  id: string;
  title: string;
  precondition: string;
  steps: string[];
  expected: string[];
  priority: string;
  type: string;
}

interface FuzzyPoint {
  description: string;
  suggestion: string;
}

interface Result {
  title: string;
  summary: string;
  testCases: TestCase[];
  fuzzyPoints: FuzzyPoint[];
  metadata?: { provider: string; model: string; durationMs: number; tokens: number };
}

const MAX_CHARS = 10000;

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const [editHighlight, setEditHighlight] = useState(false);
  const [isDebug, setIsDebug] = useState(false);

  // Check debug mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsDebug(new URLSearchParams(window.location.search).get("debug") === "1");
    }
  }, []);

  // Auto-save result to localStorage (locale-scoped)
  const storageKey = `testpilot-${locale}-last-result`;
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.testCases && parsed.testCases.length > 0) {
          setResult(parsed);
        }
      } catch { /* ignore */ }
    }
  }, [storageKey]);

  useEffect(() => {
    if (result) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(result));
      } catch { /* localStorage full - ignore */ }
    }
  }, [result, storageKey]);

  // Scroll to edit panel when opening
  useEffect(() => {
    if (editingId) {
      setTimeout(() => {
        editRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        setEditHighlight(true);
        setTimeout(() => setEditHighlight(false), 1200);
      }, 100);
    }
  }, [editingId]);

  const handleSubmit = useCallback(async () => {
    if (!text.trim()) {
      setError(t("input.error"));
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, MAX_CHARS), locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("error.fallback"));
      } else {
        setResult(data);
      }
    } catch {
      setError(t("error.networkError"));
    } finally {
      setLoading(false);
    }
  }, [text, t, locale]);

  const updateTestCase = useCallback(
    (id: string, field: string, value: string | string[]) => {
      if (!result) return;
      setResult({
        ...result,
        testCases: result.testCases.map((tc) =>
          tc.id === id ? { ...tc, [field]: value } : tc
        ),
      });
    },
    [result]
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setText("");
    setEditingId(null);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const copyText = useCallback(async () => {
    if (!result) return;
    const lines = result.testCases.map(
      (tc) => {
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        const expected = Array.isArray(tc.expected) ? tc.expected : [tc.expected];
        const pairs = steps.map((s, i) => `${i + 1}. ${s}  →  ${t("copy.expectedLabel")}${expected[i] || "-"}`).join("\n");
        return `[${tc.id}] ${tc.title}\n${t("copy.precondition")}${tc.precondition}\n${t("table.steps") || "Test Steps"} → ${t("copy.expectedLabel")}\n${pairs}\n${t("copy.priority")}${tc.priority} | ${t("copy.type")}${tc.type}\n`;
      }
    );
    const textContent = `# ${result.title}\n${result.summary}\n\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(textContent);
      setToast(t("copy.success"));
    } catch {
      setToast(t("copy.failure"));
    }
    setTimeout(() => setToast(""), 2500);
  }, [result, t]);

  const downloadExcel = useCallback(async () => {
    if (!result) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(t("excel.sheet"));
      ws.columns = [
        { header: t("excel.colId"), key: "id", width: 10 },
        { header: t("excel.colTitle"), key: "title", width: 30 },
        { header: t("excel.colPrecondition"), key: "precondition", width: 25 },
        { header: t("excel.colSteps"), key: "steps", width: 40 },
        { header: t("excel.colExpected"), key: "expected", width: 30 },
        { header: t("excel.colPriority"), key: "priority", width: 8 },
        { header: t("excel.colType"), key: "type", width: 10 },
      ];
      result.testCases.forEach((tc) => {
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        const expected = Array.isArray(tc.expected) ? tc.expected : [tc.expected];
        const stepsText = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const expectedText = expected.map((e, i) => `${i + 1}. ${e}`).join("\n");
        ws.addRow({
          ...tc,
          steps: stepsText,
          expected: expectedText,
        });
      });
      ws.getRow(1).font = { bold: true };
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = t("excel.filename", { title: result.title || "export" });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast(t("excel.error"));
      setTimeout(() => setToast(""), 2500);
    }
  }, [result, t]);

  const charCount = text.length;
  const isOver = charCount > MAX_CHARS;
  const types = t.raw("types") as string[];

  // Get examples from translations
  const examples = t.raw("examples.items") as Array<{ title: string; input: string; output: string }>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">TestPilot</h1>
            <p className="text-zinc-500 mt-1">{t("header.subtitle")}</p>
            <p className="text-zinc-400 text-sm mt-1">{t("header.tagline")}</p>
          </div>
          <Link
            href="/"
            locale={locale === "zh" ? "en" : "zh"}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors shrink-0"
          >
            {t("lang.toggle")}
          </Link>
        </div>
      </header>

      {/* Input Area */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("input.placeholder")}
          className={`w-full min-h-40 p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${isOver ? "border-red-400" : "border-zinc-200"}`}
          rows={8}
        />
        <div className="flex justify-between items-center mt-2 text-xs text-zinc-400">
          <span>{charCount} / {MAX_CHARS}{isOver && t("input.charOver")}</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-3 w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? t("input.submitting") : t("input.submit")}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-zinc-100 rounded w-1/3 mx-auto" />
            <div className="h-3 bg-zinc-50 rounded w-2/3 mx-auto" />
            <div className="space-y-2 mt-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-3 bg-zinc-50 rounded" />
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm text-zinc-400">{t("loading.message")}</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium mb-2">{t("error.title")}</p>
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
          >
            {t("error.retry")}
          </button>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <h2 className="text-lg font-semibold">{result.title}</h2>
            <p className="text-sm text-zinc-500 mt-1">{result.summary}</p>
            {result.metadata && isDebug && (
              <p className="text-xs text-zinc-400 mt-1">
                {result.metadata.provider}/{result.metadata.model} · {(result.metadata.durationMs / 1000).toFixed(1)}s · {result.metadata.tokens} tokens
              </p>
            )}
          </div>

          {/* Export Toolbar */}
          <div className="flex justify-between items-center">
            <button
              onClick={clearResult}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors"
            >
              {t("toolbar.new")}
            </button>
            <div className="flex gap-3">
              <button
                onClick={copyText}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                {t("toolbar.copy")}
              </button>
              <button
                onClick={downloadExcel}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {t("toolbar.download")}
              </button>
            </div>
          </div>

          {/* Test Cases Table */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left p-3 w-20">{t("table.id")}</th>
                    <th className="text-left p-3 w-92">{t("table.title")}</th>
                    <th className="text-left p-3 w-24">{t("table.priority")}</th>
                    <th className="text-left p-3 w-24">{t("table.type")}</th>
                    <th className="text-left p-3">{t("table.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.testCases.map((tc) => (
                    <tr key={tc.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                      <td className="p-3 text-zinc-400">{tc.id}</td>
                      <td className="p-3 font-medium">{tc.title}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          tc.priority === "P0" ? "bg-red-100 text-red-700" :
                          tc.priority === "P1" ? "bg-orange-100 text-orange-700" :
                          tc.priority === "P2" ? "bg-yellow-100 text-yellow-700" :
                          tc.priority === "P3" ? "bg-blue-100 text-blue-700" :
                          "bg-zinc-100 text-zinc-400"
                        }`}>{tc.priority}</span>
                      </td>
                      <td className="p-3 text-zinc-500">{tc.type}</td>
                      <td className="p-3">
                        <button
                          onClick={() => setEditingId(editingId === tc.id ? null : tc.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          {editingId === tc.id ? t("table.collapse") : t("table.edit")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inline Edit Panel */}
          {editingId && result.testCases.find((tc) => tc.id === editingId) && (() => {
            const tc = result.testCases.find((t) => t.id === editingId)!;
            return (
              <div className={`bg-white rounded-xl border-2 p-5 transition-colors duration-700 ${editHighlight ? "border-blue-400 bg-blue-50/50" : "border-blue-200"}`} ref={editRef}>
                <h3 className="text-sm font-semibold mb-3">{t("edit.heading", { id: tc.id })}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">{t("edit.caseTitle")}</label>
                    <input
                      value={tc.title}
                      onChange={(e) => updateTestCase(tc.id, "title", e.target.value)}
                      className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">{t("edit.precondition")}</label>
                    <input
                      value={tc.precondition}
                      onChange={(e) => updateTestCase(tc.id, "precondition", e.target.value)}
                      className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">{t("edit.steps")}</label>
                    <div className="space-y-1.5">
                      {(Array.isArray(tc.steps) ? tc.steps : [tc.steps]).map((step, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-xs text-zinc-400 pt-2 w-5 text-right shrink-0">{i + 1}.</span>
                          <input
                            value={step}
                            onChange={(e) => {
                              const steps = Array.isArray(tc.steps) ? [...tc.steps] : [tc.steps];
                              steps[i] = e.target.value;
                              updateTestCase(tc.id, "steps", steps);
                            }}
                            className="flex-1 p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => {
                              const steps = Array.isArray(tc.steps) ? [...tc.steps] : [tc.steps];
                              steps.splice(i, 1);
                              updateTestCase(tc.id, "steps", steps.length > 0 ? steps : [""]);
                            }}
                            className="text-sm text-zinc-300 hover:text-red-500 w-6 h-6 flex items-center justify-center hover:bg-red-50 rounded shrink-0 transition-colors"
                            title={t("edit.deleteStep")}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const steps = Array.isArray(tc.steps) ? [...tc.steps] : [tc.steps];
                          updateTestCase(tc.id, "steps", [...steps, ""]);
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                      >
                        {t("edit.addStep")}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">{t("edit.expected")}</label>
                    <div className="space-y-1.5">
                      {(Array.isArray(tc.expected) ? tc.expected : [tc.expected]).map((exp, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-xs text-zinc-400 pt-2 w-5 text-right shrink-0">{i + 1}.</span>
                          <input
                            value={exp}
                            onChange={(e) => {
                              const expected = Array.isArray(tc.expected) ? [...tc.expected] : [tc.expected];
                              expected[i] = e.target.value;
                              updateTestCase(tc.id, "expected", expected);
                            }}
                            className="flex-1 p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => {
                              const expected = Array.isArray(tc.expected) ? [...tc.expected] : [tc.expected];
                              expected.splice(i, 1);
                              updateTestCase(tc.id, "expected", expected.length > 0 ? expected : [""]);
                            }}
                            className="text-sm text-zinc-300 hover:text-red-500 w-6 h-6 flex items-center justify-center hover:bg-red-50 rounded shrink-0 transition-colors"
                            title={t("edit.deleteExpected")}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const expected = Array.isArray(tc.expected) ? [...tc.expected] : [tc.expected];
                          updateTestCase(tc.id, "expected", [...expected, ""]);
                        }}
                        className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                      >
                        {t("edit.addExpected")}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400 block mb-1">{t("edit.priority")}</label>
                      <select
                        value={tc.priority}
                        onChange={(e) => updateTestCase(tc.id, "priority", e.target.value)}
                        className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {["P0", "P1", "P2", "P3", "P4"].map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400 block mb-1">{t("edit.type")}</label>
                      <select
                        value={tc.type}
                        onChange={(e) => updateTestCase(tc.id, "type", e.target.value)}
                        className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {types.map((tp) => (
                          <option key={tp} value={tp}>{tp}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Fuzzy Points */}
          {result.fuzzyPoints.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">{t("fuzzy.title")}</h3>
              <ul className="space-y-2">
                {result.fuzzyPoints.map((fp, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    <p>{fp.description}</p>
                    {fp.suggestion && <p className="text-xs text-amber-500 mt-0.5">{t("fuzzy.suggestion", { suggestion: fp.suggestion })}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}

      {/* Empty state — Feature Showcase + Example Gallery */}
      {!result && !loading && !error && (
        <div className="space-y-6 mt-4">
          {/* Feature Showcase */}
          <div>
            <h2 className="text-sm font-semibold mb-4">{t("features.title")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">⚡</div>
                <h3 className="text-sm font-semibold">{t("features.instant.name")}</h3>
                <p className="text-xs text-zinc-500 mt-1">{t("features.instant.desc")}</p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">✏️</div>
                <h3 className="text-sm font-semibold">{t("features.edit.name")}</h3>
                <p className="text-xs text-zinc-500 mt-1">{t("features.edit.desc")}</p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">🔍</div>
                <h3 className="text-sm font-semibold">{t("features.fuzzy.name")}</h3>
                <p className="text-xs text-zinc-500 mt-1">{t("features.fuzzy.desc")}</p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">📤</div>
                <h3 className="text-sm font-semibold">{t("features.export.name")}</h3>
                <p className="text-xs text-zinc-500 mt-1">{t("features.export.desc")}</p>
              </div>
            </div>
          </div>

          {/* Example Gallery */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <h2 className="text-sm font-semibold mb-3">{t("examples.title")}</h2>
            <p className="text-xs text-zinc-400 mb-4">{t("examples.intro")}</p>
            <div className="space-y-4">
              {examples.map((ex, i) => (
                <div key={i} className="border border-zinc-100 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-700">{ex.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    <span className="font-medium text-zinc-400">{t("examples.input")}</span>{ex.input}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    <span className="font-medium text-zinc-400">{t("examples.output")}</span>{ex.output}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
