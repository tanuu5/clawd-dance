# clawd-dance

Claude Code のデスクトップアプリで、入力欄の上に Clawd が住みつき、Claude の作業に合わせて踊る非公式ファンメイドの mod。

[![Claude Code Desktop mod](https://img.shields.io/badge/Claude%20Code-Desktop%20mod-C67D5F?style=for-the-badge)](https://code.claude.com/docs/en/plugins/mods/overview)
[![Made with Claude Opus 5.5 (HIGH)](https://img.shields.io/badge/Made%20with-Claude%20Opus%205.5%20%28HIGH%29-D97757?style=for-the-badge)](https://www.anthropic.com/claude)
[![License: MIT (code)](https://img.shields.io/badge/License-MIT%20%28code%29-3A2A22?style=for-the-badge)](./LICENSE)

<p align="center">
  <img src="docs/screenshots/demo.webp" width="600" alt="入力欄の上の帯で、Clawd が寝ている状態から起きて踊り、ファイルを読む間はきょろきょろ、編集の間はタイピングし、終わるとバンザイする様子。右側にコンテキストと利用枠の使用量が並ぶ">
</p>

**Claude Code × Claude Opus 5.5（HIGH）** で作りました。

Claude が考えているあいだ、ただ待つのは少しさみしい。そこで、プロンプトの上の帯に Clawd を置いて、作業の中身に合わせてポーズを変えるようにしました。コマンドを実行すれば激しく踊り、ファイルを読めばきょろきょろし、編集すればノート PC でタイピングします。終わればバンザイ、放っておけば眠ります。帯の右側には、コンテキストの使用率と 5 時間枠・7 日枠の利用状況も出ます。

> [!NOTE]
> 非公式のファンメイド作品です。Clawd は Anthropic の Claude Code のマスコットで、この作品は Anthropic とは関係ありません。

## スクリーンショット

<img src="docs/screenshots/working.jpg" width="800" alt="作業中の帯。Clawd が踊り、右側にコンテキストと利用枠の使用量が並ぶ"><br>
<sub>作業中。Clawd が踊り、右側に使用量が並びます。80% を超えた行は赤くなります。</sub>

<img src="docs/screenshots/idle.jpg" width="800" alt="待機中の帯。Clawd が目を閉じて眠り、z が浮かぶ"><br>
<sub>待機中。しばらく放っておくと眠ります。</sub>

<p align="center">
  <img src="docs/screenshots/poses.jpg" width="800" alt="8 つのポーズの一覧。作業中、Bash、Read・検索、Edit・Write、長考、終わった、待機、放置 3 分">
</p>

上の動画と帯の画像は、実際のアプリの画面を録画して切り出したものです（動画は Clawd の周りを 2 倍に拡大し、各ポーズの場面をつないでいます）。ポーズの一覧は、mod が描く SVG をそのままブラウザで表示したものです。

## 動き

| 場面 | Clawd |
| --- | --- |
| 作業中 | 踊る |
| Bash の実行中 | 倍速で激しく踊る |
| Read・Grep・Glob・Web 検索・MCP ツール | 首をかしげて、きょろきょろ |
| Edit・Write | ノート PC でタイピング |
| 30 秒たった／2 分たった | 汗が 1 滴／2 滴 |
| ターンが終わった直後 | 4 秒だけバンザイ |
| その後 | まばたきしながら待つ |
| 3 分放置 | 眠る（zzz） |

- 一度なったポーズは最低 1.5 秒続きます。Edit のように一瞬で終わる作業でも姿が見えます。
- 15 秒以上かかったターンが終わると、「ピロローン」と効果音を鳴らしてから「終わったよ」と読み上げます（2 分以上なら「おまたせ、終わったよ」）。効果音は音声ファイルを使わずコードで合成し、読み上げには macOS の `say` の日本語音声（Kyoko）を使います。
- 帯の右側には、コンテキストの使用率とトークン数、5 時間枠・7 日枠の使用率とリセットまでの時間が出ます。数字はツールの実行後とターンの終わりに更新されます。

## インストール

**動作環境**：Claude Code のデスクトップアプリ（Code タブ）。mod は公式には Claude Code v2.1.287 以上が必要です。作者は、それより前の早期公開版の mod が入った macOS 版のデスクトップアプリ 2.19675.0（中に入っている Claude Code は 2.1.286）で確かめました。ターミナルの `claude` や VS Code 拡張では帯に何も出ません。

ターミナルで次の 2 行を実行します。

```bash
claude plugin marketplace add tanuu5/clawd-dance
```

```bash
claude plugin install clawd-dance@clawd-dance
```

セッション内で `/plugin marketplace add tanuu5/clawd-dance` と `/plugin install clawd-dance@clawd-dance` を使っても同じです。入れたあと、新しいセッションを開くと帯に Clawd が出ます。外すときは `/plugin` の画面で無効にするか、`claude plugin uninstall clawd-dance@clawd-dance` を実行します。

### 設定を変える

`/config` の画面に、この mod の設定が並びます。

| 設定 | 既定 | 内容 |
| --- | --- | --- |
| 終わったときの音 | 効果音と声 | 効果音と声／効果音だけ／声だけ／鳴らさない |
| 音を鳴らすターンの長さ（秒） | 15 | この秒数以上かかったターンだけ鳴らす |
| 読み上げの声 | Kyoko | macOS の声の名前。入っていない声なら既定の声で読む |
| 待機中も帯を出す | オン | オフにすると、作業中だけ帯を出す |
| バンザイの長さ（秒） | 4 | ターンが終わった直後にバンザイしている時間 |
| 眠るまでの時間（分） | 3 | ターンが終わってから眠るまでの時間 |

### この mod がすること・しないこと

mod は Claude Code の中で、あなたの権限のまま動きます。入れる前に中身を確かめてください。

- フックするイベント：`turn.start`、`tool.call`、`turn.complete`、`ui.render`（帯の `AbovePrompt` だけ）
- `tool.call` は、どのツールが動いているかを見るだけです。許可・拒否の判断や、ツールへの入力は変えません。
- 使う API：`$.session.usage()`（使用量の取得）、`$.audio.play()`（効果音）、`$.audio.speak()`（読み上げ）、`$.clock`（タイマー）、`$.ui`（描画）
- ネットワーク通信、ファイルの読み書き、別モデルへの問い合わせはしません。

## 制作について

企画・ディレクション：**たぬ**　／　開発：**Claude Code（Claude Opus 5.5・推論レベル HIGH）**

mod が発表された翌日に、「Claude が考えているあいだに Clawd を踊らせたい」という思いつきから作りました。Clawd の絵は、以前の作品で描き起こした SVG を元に、最新の Clawd に合わせて脚の位置を直しています。作業中のマーク（スピナー）の差し替えや、返答の末尾に Clawd を添える案も試しました。しかし、デスクトップ版ではスピナーが mod の差し替え対象になっておらず、返答の末尾は文字が届くたびに描き直されて点滅したため、入力欄の上の帯に落ち着きました。踊りは SVG の中の CSS アニメーションだけで動かしています。ポーズごとの絵を最初に全部置いておき、表示・非表示を切り替えることで、切り替えの瞬間に Clawd が消えないようにしています。

## 更新履歴

- **2026-10-02**：公開

## 開発

```text
.claude-plugin/marketplace.json        マーケットプレイスの定義
plugins/clawd-dance/
  .claude-plugin/plugin.json           mod の定義
  hooks/hooks.json                     読み込むモジュール
  hooks/register.tsx                   本体（ポーズの SVG、効果音の合成、帯の描画、フック）
  tests/band.test.tsx                  帯が描けるかのテスト
```

手元の版を直接読み込むには、`claude --plugin-dir ./plugins/clawd-dance` で起動します。起動フラグを渡せないデスクトップアプリでは、`~/.claude/settings.json` の `env` に `CLAUDE_CODE_PLUGIN_DIRS` として、このフォルダの絶対パスを書きます（反映にはセッションの開き直しが必要です）。

```bash
claude plugin validate ./plugins/clawd-dance
```

```bash
claude plugin test ./plugins/clawd-dance
```

型を確かめるには、mod を一度読み込ませて型定義（`.claude-plugin/types/`）を書き出させてから、`npx -p typescript tsc -p plugins/clawd-dance/tsconfig.json` を実行します。

## クレジット・ライセンス

- コード：MIT License（[LICENSE](LICENSE)）© 2026 たぬ
- **Clawd について**：Clawd は Anthropic の Claude Code のマスコットです。この mod の Clawd は、公式アセットを使わずに SVG で描き起こした二次創作（ファンアート）です。Clawd のキャラクターは MIT License の対象外で、名称とキャラクターの権利は Anthropic に帰属します。
- MIT License の対象はこのリポジトリのコードと文章です。「Claude」の名前や商標の使用を許諾するものではありません。
