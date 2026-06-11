# Agent Instructions

# Warboard-Theater

歷史戰役 3D 推演網頁

## New Conversation Opening Check

At conversation start, read in this layered order. Ignore `舊文件/`.

**Layer 1 — 必讀（建立全貌）：**
1. `AGENTS.md`（本檔）
2. `規格書.md`
3. `已知問題.md`
4. `git log --oneline -10`（近期變更）

**Layer 2 — 實作 / 測試文件：**


**Layer 3 — 任務相關細節與實作參考：**

## Project Skills

This project uses local skills from `C:\_work\AI_Work\Skills\`.

Trigger rules:
- Diagnosing bugs / analyzing errors / finding root cause → read `Skills\engineering\diagnose\SKILL.md` first
- Requirements unclear / spec discussion / planning / need to ask clarifying questions → read `Skills\productivity\grill-me\SKILL.md` first
- Frontend / local web app verification, UI behavior debugging, browser screenshots, or console logs → read `Skills\engineering\webapp-testing\SKILL.md` first

Only modify files when user explicitly requests fix, implement, or commit. Verify/diagnose = report only.

## 重要通用規則

當使用者要求「驗證」時，只能進行code review、檢查、讀檔、執行測試、啟動本機服務與回報結果。

除非使用者明確要求「修」、「修改」、「commit」或「提交」，否則不得：

- 修改任何程式碼或文件
- 自行套 patch
- stage 檔案
- 建立 commit

若驗證中發現問題，只列出問題、影響範圍與建議修法，等待使用者下一步指示。

## 修改程式碼授權規則

除非使用者明確要求「修」、「修改」、「實作」、「處理某個 phase」、「commit」或「提交」，否則不得修改任何程式碼、文件或設定檔。

當使用者只是描述錯誤、貼截圖、詢問原因、要求解釋、要求列出問題、要求驗證，或詢問某功能怎麼使用時，只能分析與回報，不得自行套 patch。

