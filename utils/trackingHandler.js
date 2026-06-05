/**
 * trackingHandler.js
 *
 * Detects the advertiser link platform and builds the final
 * redirect / forward URL with all IDs correctly injected.
 *
 * Supported platforms:
 *   - appsflyer  : app.appsflyer.com or appsflyer.com
 *   - playstore  : play.google.com with referrer= param
 *   - branch     : app.link, branch.io, impression.link, branch_key param
 *   - web        : everything else (generic / custom tracker)
 *
 * Called by BOTH clickController and impressionController so any
 * fix here applies to both pipelines automatically.
 */

function detectLinkType(url) {
  if (url.includes("app.appsflyer.com") || url.includes("appsflyer")) {
      return "appsflyer";
    }    if (url.includes("play.google.com") && url.includes("referrer=")) return "playstore";
     // Branch detection — impression.link, app.link, branch.io, or branch_key param
  if (
    url.includes("app.link")        ||
    url.includes("branch.io")       ||
    url.includes("impression.link") ||
    url.includes("branch_key")
  ) return "branch";

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
// ADD THIS after handlePlayStore, before handleWeb
function handleBranch(url, clickId) {
  const u = new URL(url);

  // Branch macros are pre-replaced upstream before buildRedirectURL is called.
  // Safety: if ~click_id still has a placeholder, force it now.
  const currentVal = u.searchParams.get("~click_id");
  if (currentVal && currentVal.includes("{")) {
    u.searchParams.set("~click_id", clickId);
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

  if (type === "branch") {
    return handleBranch(advertiser_link, advertiserClickId);
  }

  return handleWeb(advertiser_link, advertiserClickId, adv);
}

module.exports = { buildRedirectURL, detectLinkType };
