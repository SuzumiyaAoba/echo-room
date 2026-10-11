export function credits({ icon, version }) {
  return `<div class="credits-about">
    <div class="credits-light" aria-hidden="true">${icon("lighthouse")}</div>
    <div class="eyebrow">YESTERDAY BECOMES TOMORROW</div>
    <h3>残響の灯台 <span>ECHO LOOM</span></h3>
    <p class="credits-message">ひとりの灯守。いくつもの昨日。<br>この灯りを織ってくれて、ありがとう。</p>
    <dl class="credits-work"><div><dt>世界と絵</dt><dd>沈んだ街、灯守、残響。作品のために描いたドット絵。</dd></div><div><dt>音と音楽</dt><dd>港の潮、庭の鈴、炉の鼓動。コードから生まれる音色。</dd></div><div><dt>あなたの記憶</dt><dd>このブラウザに残ります。設定から書き出して、別の岸へ持っていけます。</dd></div></dl>
    <p class="credits-version">ブラウザ版 v${version}</p>
    <div class="credits-software"><h4>この作品を支えるもの</h4><p>配布の生成にViteを使用しています。使用ソフトウェアの権利表記を、通信のない時もここから読めます。</p></div>
  </div>`;
}
