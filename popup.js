const applyRuleBtn = document.querySelector("#applyRule");
const resetPageBtn = document.querySelector("#resetPage");
const ruleEl = document.querySelector("#rule");
const lipogramLettersEl = document.querySelector("#lipogramLetters");
const statusEl = document.querySelector("#status");

applyRuleBtn?.addEventListener("click", async () => {
  const rule = ruleEl?.value ?? "prisoners_constraint";
  const lipogramLetters = String(lipogramLettersEl?.value ?? "");

  statusEl.textContent = "Applying rule…";
  try {
    const res = await chrome.runtime.sendMessage({
      type: "APPLY_RULE_ACTIVE_TAB",
      rule,
      lipogramLetters,
    });
    statusEl.textContent = res?.ok ? "Done." : (res?.error ?? "Failed.");
  } catch (err) {
    statusEl.textContent = `Error: ${err?.message ?? err}`;
  }
});

resetPageBtn?.addEventListener("click", async () => {
  statusEl.textContent = "Resetting page…";
  try {
    const res = await chrome.runtime.sendMessage({ type: "RESET_ACTIVE_TAB" });
    statusEl.textContent = res?.ok ? "Page reset." : (res?.error ?? "Failed.");
  } catch (err) {
    statusEl.textContent = `Error: ${err?.message ?? err}`;
  }
});
