"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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

const EXAMPLES = [
  {
    title: "用户登录功能",
    input: "用户登录功能需求：支持用户名+密码登录。连续输错密码3次，锁定账号30分钟。支持\"记住我\"功能，有效期7天。",
    output: "生成 23 条用例，覆盖正常登录、密码错误、账号锁定、记住我、密码为空、SQL注入防护等场景。",
  },
  {
    title: "订单优惠券叠加",
    input: "用户下单页面，支持输入优惠码。优惠码可叠加使用，最多叠加2张。每张优惠码有最低消费门槛。",
    output: "生成 18 条用例，覆盖单张/双张使用、门槛判断、叠加超限、过期码、并发使用等场景。",
  },
  {
    title: "权限管理模块",
    input: "管理员可以为子账号分配角色权限。角色包含：只读、编辑、审批。权限粒度到页面级。角色变更后实时生效。",
    output: "生成 31 条用例，覆盖角色分配/切换/删除、权限校验、跨租户隔离、变更即时性等场景。",
  },
];

export default function Home() {
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

  // Auto-save result to localStorage
  useEffect(() => {
    const saved = localStorage.getItem("testpilot-last-result");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.testCases && parsed.testCases.length > 0) {
          setResult(parsed);
        }
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (result) {
      try {
        localStorage.setItem("testpilot-last-result", JSON.stringify(result));
      } catch { /* localStorage full - ignore */ }
    }
  }, [result]);

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
      setError("请输入需求描述");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, MAX_CHARS) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "生成失败，请重试");
      } else {
        setResult(data);
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [text]);

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
    localStorage.removeItem("testpilot-last-result");
  }, []);

  const copyText = useCallback(async () => {
    if (!result) return;
    const lines = result.testCases.map(
      (tc) => {
        const steps = Array.isArray(tc.steps) ? tc.steps : [tc.steps];
        const expected = Array.isArray(tc.expected) ? tc.expected : [tc.expected];
        const pairs = steps.map((s, i) => `${i + 1}. ${s}  →  预期：${expected[i] || "-"}`).join("\n");
        return `[${tc.id}] ${tc.title}\n前置条件：${tc.precondition}\n测试步骤 → 预期：\n${pairs}\n优先级：${tc.priority} | 类型：${tc.type}\n`;
      }
    );
    const textContent = `# ${result.title}\n${result.summary}\n\n${lines.join("\n")}`;
    try {
      await navigator.clipboard.writeText(textContent);
      setToast("已复制到剪贴板");
    } catch {
      setToast("复制失败，请手动选择复制");
    }
    setTimeout(() => setToast(""), 2500);
  }, [result]);

  const downloadExcel = useCallback(async () => {
    if (!result) return;
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("测试用例");
      ws.columns = [
        { header: "用例编号", key: "id", width: 10 },
        { header: "用例标题", key: "title", width: 30 },
        { header: "前置条件", key: "precondition", width: 25 },
        { header: "测试步骤", key: "steps", width: 40 },
        { header: "预期结果", key: "expected", width: 30 },
        { header: "优先级", key: "priority", width: 8 },
        { header: "类型", key: "type", width: 10 },
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
      a.download = `测试用例_${result.title || "export"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToast("导出失败，请重试");
      setTimeout(() => setToast(""), 2500);
    }
  }, [result]);

  const charCount = text.length;
  const isOver = charCount > MAX_CHARS;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TestPilot</h1>
          <p className="text-zinc-500 mt-1">测试用例生成器 — 输入需求，即刻生成结构化用例</p>
          <p className="text-zinc-400 text-sm mt-1">输入需求，自动生成结构化测试用例。覆盖正向、边界值、异常场景。</p>
        </div>
      </header>

      {/* Input Area */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 mb-4">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴你的 PRD 或需求描述 …&#10;&#10;例如：用户下单页面，支持优惠码叠加使用，最多2张，每张有最低消费门槛。"
          className={`w-full min-h-40 p-3 border rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${isOver ? "border-red-400" : "border-zinc-200"}`}
          rows={8}
        />
        <div className="flex justify-between items-center mt-2 text-xs text-zinc-400">
          <span>{charCount} / {MAX_CHARS}{isOver && " — 已超限，提交时自动截断"}</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-3 w-full py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "正在分析需求并生成用例…" : "生成测试用例"}
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
          <p className="mt-4 text-sm text-zinc-400">正在分析需求并生成用例…</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium mb-2">生成失败</p>
          <p className="text-red-500 text-sm mb-4">{error}</p>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
          >
            重试
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
              新需求
            </button>
            <div className="flex gap-3">
              <button
                onClick={copyText}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-sm font-medium hover:bg-zinc-50 transition-colors"
              >
                复制用例
              </button>
              <button
                onClick={downloadExcel}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                下载 Excel
              </button>
            </div>
          </div>

          {/* Test Cases Table */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left p-3 w-20">用例编号</th>
                    <th className="text-left p-3 w-92">用例标题</th>
                    <th className="text-left p-3 w-24">优先级</th>
                    <th className="text-left p-3 w-24">类型</th>
                    <th className="text-left p-3">操作</th>
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
                          {editingId === tc.id ? "收起" : "编辑"}
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
                <h3 className="text-sm font-semibold mb-3">编辑 {tc.id}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">用例标题</label>
                    <input
                      value={tc.title}
                      onChange={(e) => updateTestCase(tc.id, "title", e.target.value)}
                      className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">前置条件</label>
                    <input
                      value={tc.precondition}
                      onChange={(e) => updateTestCase(tc.id, "precondition", e.target.value)}
                      className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">测试步骤</label>
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
                            title="删除此测试步骤"
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
                        + 添加测试步骤
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 block mb-1">预期结果</label>
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
                            title="删除此预期"
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
                        + 添加预期
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-zinc-400 block mb-1">优先级</label>
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
                      <label className="text-xs text-zinc-400 block mb-1">类型</label>
                      <select
                        value={tc.type}
                        onChange={(e) => updateTestCase(tc.id, "type", e.target.value)}
                        className="w-full p-2 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {["功能", "边界值", "异常", "兼容性", "性能"].map((t) => (
                          <option key={t} value={t}>{t}</option>
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
              <h3 className="text-sm font-semibold text-amber-800 mb-2">规则模糊点</h3>
              <ul className="space-y-2">
                {result.fuzzyPoints.map((fp, i) => (
                  <li key={i} className="text-sm text-amber-700">
                    <p>{fp.description}</p>
                    {fp.suggestion && <p className="text-xs text-amber-500 mt-0.5">建议：{fp.suggestion}</p>}
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
            <h2 className="text-sm font-semibold mb-4">核心能力</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">⚡</div>
                <h3 className="text-sm font-semibold">即时生成</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  粘贴 PRD 或需求描述，AI 自动解析并生成结构化测试用例，覆盖功能、边界值、异常等场景。
                </p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">✏️</div>
                <h3 className="text-sm font-semibold">内联编辑</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  点击表格中的任意用例即可展开编辑面板，直接修改标题、步骤、预期结果、优先级和类型，无需弹窗或跳转。
                </p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">🔍</div>
                <h3 className="text-sm font-semibold">规则盲区识别</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  自动检测需求中的模糊地带与未定义边界，标记出来并给出补充建议，避免遗漏关键测试场景。
                </p>
              </div>
              <div className="bg-white rounded-xl border border-zinc-200 p-4">
                <div className="text-lg mb-1">📤</div>
                <h3 className="text-sm font-semibold">一键导出</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  支持复制 Markdown 文本和下载 Excel 文件，直接粘贴到 TAPD/Jira 或用 Excel 二次编辑。
                </p>
              </div>
            </div>
          </div>

          {/* Example Gallery */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <h2 className="text-sm font-semibold mb-3">示例</h2>
            <p className="text-xs text-zinc-400 mb-4">以下是一些真实的输入输出示例，帮你了解 TestPilot 能做什么：</p>
            <div className="space-y-4">
              {EXAMPLES.map((ex, i) => (
                <div key={i} className="border border-zinc-100 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-700">{ex.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    <span className="font-medium text-zinc-400">输入：</span>{ex.input}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    <span className="font-medium text-zinc-400">输出：</span>{ex.output}
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
