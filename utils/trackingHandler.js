function detectLinkType(url) {
  if (url.includes("app.appsflyer.com") || url.includes("appsflyer")) {
      return "appsflyer";
    }    if (url.includes("play.google.com") && url.includes("referrer=")) return "playstore";
  return "web";
}

//   function handleAppsflyer(url, clickId, adv) {
//     const u = new URL(url);
//     const param = adv.click_id_param || "clickid";

//     // 🔥 remove ALL possible conflicting params
//     u.searchParams.delete("click_id");   // wrong param
//     u.searchParams.delete("clickid");    // remove existing before setting

//     // 🔥 clean placeholder cases
//     if (u.searchParams.get(param)?.includes("{")) {
//       u.searchParams.delete(param);
//     }

//     // ✅ set ONLY one correct param
//     u.searchParams.set(param, clickId);

//     return u.toString();
//   }

function handleAppsflyer(url, clickId, adv) {
  const u = new URL(url);

  // 🔥 ALWAYS force AppsFlyer param
  const param = "clickid";   // 👈 override DB value

  // remove wrong params
  u.searchParams.delete("click_id");
  u.searchParams.delete("clickid");

  // set correct one
  u.searchParams.set(param, clickId);

  return u.toString();
}

//   function handleAppsflyer(url, clickId, adv) {
//     const u = new URL(url);
//     const param = adv.click_id_param || "clickid";

//     // ❌ remove wrong params
//     u.searchParams.delete("click_id");

//     // 🔥 also clean bad encoded placeholders if any slipped
//     if (u.searchParams.get(param)?.includes("{")) {
//       u.searchParams.delete(param);
//     }

//     // ✅ set correct param
//     u.searchParams.set(param, clickId);

//     return u.toString();
//   }

//   function handlePlayStore(url, clickId, source) {
//     const u = new URL(url);
//     const referrer = u.searchParams.get("referrer");

//     if (referrer) {
//       const refParams = new URLSearchParams(referrer);

//       refParams.set("clickid", clickId); // 🔥 critical
//       if (source) refParams.set("af_sub_siteid", source);

//       u.searchParams.set("referrer", refParams.toString());
//     }

//     return u.toString();
//   }
function handlePlayStore(url, clickId, source) {
  const u = new URL(url);

  let referrer = u.searchParams.get("referrer");

  if (referrer) {
    // 🔥 Decode first (VERY IMPORTANT)
    referrer = decodeURIComponent(referrer);

    const refParams = new URLSearchParams(referrer);

    // 🔥 Inject click ID (MANDATORY)
    refParams.set("clickid", clickId);

    // 🔥 Fix source replacement
    if (source) {
      refParams.set("af_sub_siteid", source);
    }

    // 🔥 Re-encode properly
    u.searchParams.set("referrer", encodeURIComponent(refParams.toString()));
  }

  return u.toString();
}

function handleWeb(url, clickId, adv) {
  const u = new URL(url);
  const param = adv.click_id_param || "click_id";

  u.searchParams.set(param, clickId);
  return u.toString();
}

function buildRedirectURL({ advertiser_link, advertiserClickId, source, adv }) {
  const type = detectLinkType(advertiser_link);

  if (type === "appsflyer") {
    return handleAppsflyer(advertiser_link, advertiserClickId, adv);
  }

  if (type === "playstore") {
    return handlePlayStore(advertiser_link, advertiserClickId, source);
  }

  return handleWeb(advertiser_link, advertiserClickId, adv);
}

module.exports = { buildRedirectURL };
