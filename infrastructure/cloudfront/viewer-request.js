function redirect(location) {
  return {
    statusCode: 302,
    statusDescription: "Found",
    headers: { location: { value: location } },
  };
}

function encodedSegment(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch (error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    return encodeURIComponent(value);
  }
}

function footballScope(query) {
  var result = "";
  ["leagueId", "season"].forEach(function (key) {
    if (query && query[key] && query[key].value) result += "&" + key + "=" + encodedSegment(query[key].value);
  });
  return result;
}

// CloudFront Functions invokes this global entry point by name.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lookupUri = uri.length > 1 && uri.charAt(uri.length - 1) === "/" ? uri.substring(0, uri.length - 1) : uri;

  // /api/* must be attached to a separate CloudFront behavior/API origin.
  if (uri === "/api" || uri.indexOf("/api/") === 0) return request;

  var detail = uri.match(/^\/(users|inquiries|moderation|squads|standings|schedules|fixtures|audit)\/([^/]+)\/?$/);
  if (detail && detail[2] !== "detail" && detail[2].indexOf(".") === -1) {
    var parameterByRoute = {
      users: "userId",
      inquiries: "inquiryId",
      moderation: "reportId",
      squads: "playerId",
      standings: "teamId",
      schedules: "fixtureId",
      fixtures: "fixtureId",
      audit: "auditId",
    };
    var route = detail[1] === "fixtures" ? "schedules" : detail[1];
    return redirect("/" + route + "/detail/?" + parameterByRoute[detail[1]] + "=" + encodedSegment(detail[2]) + footballScope(request.querystring));
  }

  var redirects = {
    "/dashboard": "/",
    "/players": "/squads/",
    "/data-status": "/sync/",
    "/cron": "/sync/?view=schedule",
    "/api-usage": "/usage/?view=sportsmonks",
    "/supabase": "/usage/?view=supabase",
    "/system-status": "/usage/",
  };
  if (redirects[lookupUri]) return redirect(redirects[lookupUri]);
  if (uri.indexOf("/clubs/") === 0 || lookupUri === "/clubs") return redirect("/squads/");
  if (uri.indexOf("/players/") === 0) return redirect("/squads/");
  if (uri.indexOf("/fixtures/") === 0 || lookupUri === "/fixtures") return redirect("/schedules/");
  if (uri.indexOf("/rankings/") === 0 || lookupUri === "/rankings") return redirect("/standings/");
  if (uri.indexOf("/transfers/") === 0 || lookupUri === "/transfers") return redirect("/squads/");
  if (uri.indexOf("/sync-history/") === 0 || lookupUri === "/sync-history") return redirect("/sync/");
  if (uri.indexOf("/reports/") === 0 || lookupUri === "/reports") return redirect("/moderation/");
  if (uri.indexOf("/errors/") === 0 || lookupUri === "/errors") return redirect("/usage/?view=errors");

  if (uri === "/") {
    request.uri = "/index.html";
    return request;
  }

  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  if (lastSegment.indexOf(".") === -1) request.uri = uri + "/index.html";
  return request;
}
