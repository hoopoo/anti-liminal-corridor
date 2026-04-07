# Anti-Liminal Corridor (v2)

仕様: Obsidian Vault の `Anti-Liminal-Corridor-v2-Specification.md` に準拠したブラウザ体験プロトタイプ。

## 体験フロー

- **P0 → P1 → P2**: 自動進行（リミナル → 揺らぎ → 気配）
- **Decision**: `something is present.` と **approach / ignore / leave**（低コントラスト・押下感を抑えた操作子）
- **3段のランダムパイプライン**: `700–1600ms` **無反応**（`wait`）→ **音だけ**（`audio` / `applyBranchAudioOnly`）→ **遅れて光**（`light` / コリドー分岐）→ **最後に HUD・確定**（`resolved` / `commit_decision` + life 付き `setProfile`）
- **`leave`**: 光・低域・uncertainty が **完全には戻らない** 痕跡（`medium`・わずかな暖かさ残り）
- **ホバー**: 先読みは **ごく薄く**（気のせいレベル）
- **文言**: `trace detected.` / 操作子は非 hover 時ほぼ不可視に近いコントラスト
- **知覚の底上げ**: マスター ~+15%、bed に lowshelf + 遠音 `StereoPanner` の極弱 LFO、P2/deciding/分岐のゲイン微増。光・ホバーも「説明できないが脳が拾う」レンジへ
- **P3x**: 光の**局所**（奥の一点）＋**life** 音声レイヤ（金属応力・空気塊・超低周）で空気が変化。人物・会話なし
- **HUD**: `presence` 数値は非表示。`trace: logged` / `uncertainty` のみ

## 採用タイミング（ms）

| 遷移 | 値 |
|------|-----|
| P0→P1 | 6,000 |
| P1→P2 | 9,000 |
| P2→Decision | 14,000 |

## コマンド

```bash
npm install
npm run dev
```

ビルド: `npm run build`

## 技術スタック

- Vite + React + TypeScript
- Three.js (`@react-three/fiber`, `@react-three/drei` は依存に含むがシーンは自前メッシュ中心)
- Framer Motion（HUD / 決定 UI のフェード）
- Zustand（状態）
- Web Audio API（外部音声ファイルなし）

## 音声

ブラウザ制約のため、最初の **「Tap to enter」** で AudioContext を解放します。

## デバッグ

コンソールに `[anti-liminal]` プレフィックスでフェーズ・決定イベントを出力します。  
`?debug=1` は未実装（必要なら `ExperienceHUD` 旁に出せます）。

## パフォーマンス

想定: デスクトップ 60fps。古い端末では 30fps になり得ます。
