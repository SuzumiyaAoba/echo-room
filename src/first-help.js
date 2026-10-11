// The first departure teaches the loop; the pause menu keeps the full manual.
export function firstHelp({ icon, escape, movementKeys, controlKey }) {
  const key = (action) =>
    `<kbd data-control="${action}">${escape(action === "move" ? movementKeys() : controlKey(action))}</kbd>`;
  return `<div class="first-help">
    <p class="intro-lead">昨日のあなたを、今日の味方に。</p>
    <ol class="intro-steps">
      <li class="intro-step"><div class="intro-step-title">${icon("needle")}<h3>1. 歩いて、撃つ</h3></div><p>歩いた道と射撃が、自動で記録されます。</p><div class="intro-input"><span class="intro-keys">${key("move")} · ${key("fire")}<span data-mouse-fire> / クリック</span></span><span class="intro-touch">左で移動 · 右で照準と射撃</span></div></li>
      <li class="intro-step"><div class="intro-step-title">${icon("echo")}<h3>2. 昨日と糸を張る</h3></div><p>場所を変えて残響を織る。二人の間の糸で敵を切り、中ほどで弾をほどきます。</p><div class="intro-input"><span class="intro-keys">${key("echo")} 残響</span><span class="intro-touch">残響ボタン</span></div></li>
      <li class="intro-step"><div class="intro-step-title">${icon("star")}<h3>3. 残響から解放</h3></div><p>残響の位置で爆発。近くの敵を撃ち、敵弾を消します。</p><div class="intro-input"><span class="intro-keys">${key("burst")} 解放</span><span class="intro-touch">解放ボタン</span></div></li>
    </ol>
    <div class="intro-safety"><span>足元へ来る弾は回避。</span><span class="intro-keys">${key("dash")} 回避 · ${key("pause")} 一時停止</span><span class="intro-touch">回避ボタン · 右上のⅡで停止</span></div>
    <p class="intro-practice">灯りの練習なら、体力を減らさず五つのお題で試せます。</p>
  </div>`;
}
