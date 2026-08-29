const fs = require("fs");
const html = fs.readFileSync("APP.html", "utf8");
const sMarker = "var ICONS = ['storyBtn', 'yeduBtn', 'zjszBtn', 'newsBtn', 'tvBtn'];";
const start = html.indexOf(sMarker);
const end = html.indexOf("})();", start);
// include the IIFE opener just before start: back up to "(function () {"
const opener = html.lastIndexOf("(function () {", start);
const code = html.slice(opener, end + 5);
if (start < 0 || end < 0 || opener < 0) { console.log("extract fail", start, end, opener); process.exit(1); }

function FakeEl(tag) {
  this.tag = tag; this.children = []; this.parentNode = null;
  this._cls = new Set(); this.dataset = {}; this.style = {}; this._attrs = {}; this._html = "";
  const self = this;
  this.classList = {
    add(c) { self._cls.add(c); }, remove(c) { self._cls.delete(c); },
    toggle(c, f) { if (f === undefined) { self._cls.has(c) ? self._cls.delete(c) : self._cls.add(c); } else { f ? self._cls.add(c) : self._cls.delete(c); } },
    contains(c) { return self._cls.has(c); }
  };
}
Object.defineProperty(FakeEl.prototype, "innerHTML", { get() { return this._html; }, set(v) { this._html = v; if (v === "") this.children = []; } });
FakeEl.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
FakeEl.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; };
FakeEl.prototype.getAttribute = function (k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; };
FakeEl.prototype.setAttribute = function (k, v) { this._attrs[k] = v; };
FakeEl.prototype.querySelector = function (sel) { if (sel === 'input[type="checkbox"]') return this._cb || null; return null; };
FakeEl.prototype.querySelectorAll = function () { return []; };
FakeEl.prototype.addEventListener = function () {};
FakeEl.prototype.removeEventListener = function () {};
FakeEl.prototype.dispatchEvent = function (ev) { if (this._changeCb) this._changeCb(ev); return true; };

const els = {};
function mk(id, opts) { const e = new FakeEl("div"); e.dataset.id = id; if (opts) for (const k in opts) e._attrs[k] = opts[k]; els[id] = e; return e; }
mk("launcherCircle"); mk("launcherMenu"); mk("launcherList"); mk("launcherClose");
mk("storyBtn", { style: "--cat-color:#e94560", title: "故事" });
mk("yeduBtn", { style: "--cat-color:#764ba2" }); mk("zjszBtn", { style: "--cat-color:#3b82f6" });
mk("newsBtn", { style: "--cat-color:#ff8c00" }); mk("tvBtn", { style: "--cat-color:#22c55e" });
global.document = { getElementById(id) { return els[id] || null; }, createElement(t) { return new FakeEl(t); }, querySelector(s) { return null; }, addEventListener() {}, head: new FakeEl("head"), body: new FakeEl("body") };
global.window = { Event: class { constructor(t) { this.type = t; } } };
global.Event = global.window.Event;
var AppGrid = { isHidden: () => false, isHideLogo: () => false, isHideCal: () => false, getIconShape: () => "circle", setHidden() {}, setHideLogo() {}, setHideCal() {}, setIconShape() {} };
global.AppGrid = AppGrid;

eval(code);

let pass = 0, fail = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.log("FAIL: " + n); } }
const list = els["launcherList"];
ok("list has 2 columns", list.children.length === 2);
const left = list.children[0], right = list.children[1];
ok("left is launcher-col", left._cls.has("launcher-col"));
ok("right is launcher-col", right._cls.has("launcher-col"));
ok("left title = 桌面图标", left.children[0]._html.indexOf("桌面图标") >= 0);
ok("left has 6 children (title+5)", left.children.length === 6);
let idRows = left.children.filter(c => c.dataset && c.dataset.id);
ok("left has 5 icon rows", idRows.length === 5);
ok("right has 4 children (title+2 toggles+shape)", right.children.length === 4);
let settingRows = right.children.filter(c => c.dataset && c.dataset.setting);
ok("right has 3 setting rows", settingRows.length === 3);
ok("setting keys correct", settingRows.map(r => r.dataset.setting).join(",") === "hideLogo,hideCal,iconShape");
ok("shape row has lr-seg", right.children[3]._html.indexOf("lr-seg") >= 0);

console.log("PASS=" + pass + " FAIL=" + fail);
