// 設定ファイル。公開後に書き換えるだけで動作が変わります。
window.SALON_CONFIG = {
  // Firebase Realtime Database の URL。ここに書くと、トップページでの貼り付けが不要になり、
  // リンクにURLを含めなくなります。空のままでもトップページで貼り付けて使えます。
  // 例: "https://xxxx-default-rtdb.firebaseio.com"
  firebaseUrl: "",
  // Firebase を使わない場合の保存先 (jsonblob 互換API)。既定: https://jsonblob.com/api/jsonBlob
  jsonblobUrl: "",
  // 表示名
  names: { a: "Aさん", b: "Bさん" }
};
