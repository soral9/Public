// 設定ファイル。公開後に書き換えるだけで動作が変わります。
window.SALON_CONFIG = {
  // 保存先: "jsonblob"(サインアップ不要・無料) または "firebase"
  store: "jsonblob",
  // store が "firebase" のときだけ使用。Realtime Database の URL
  // 例: "https://xxxx-default-rtdb.firebaseio.com"
  firebaseUrl: "",
  // 表示名
  names: { a: "兄", b: "弟" }
};
