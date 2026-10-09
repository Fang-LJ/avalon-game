// Fail closed: technical diagnostics are never enabled for release/unknown builds.
function envVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion;
  } catch (_) {
    return '';
  }
}

function collectStrings(value, result = [], depth = 0) {
  if (typeof value === 'string' && value) {
    result.push(value);
    if (/^Bearer\s+/i.test(value)) result.push(value.replace(/^Bearer\s+/i, ''));
  } else if (value && typeof value === 'object' && depth < 4)
    Object.keys(value).forEach((key) =>
      collectStrings(value[key], result, depth + 1),
    );
  return result;
}

function safeText(value, secrets = []) {
  let text = String(value || '');
  // Strip URL credentials/query strings, even when embedded in a native errMsg.
  text = text.replace(/(https?:\/\/|wss?:\/\/)[^\s"'<>]+/gi, (url) =>
    url.split(/[?#]/)[0].replace(/\/\/[^/]*@/, '//[REDACTED]@'),
  );
  // Longest first prevents a short credential from partially masking a long one.
  [...new Set(secrets)]
    .sort((a, b) => b.length - a.length)
    .forEach((secret) => {
      [secret, encodeURIComponent(secret)].forEach((candidate) => {
        text = text.split(candidate).join('[REDACTED]');
      });
    });
  return text
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g, '[REDACTED]')
    .replace(
      /\b(code|js_code|token|access_token|appsecret|secret|password|authorization)\s*[:=]\s*["']?[^\s,;"']+/gi,
      '$1=[REDACTED]',
    );
}

function emit(tag, buildFields) {
  try {
    const version = envVersion();
    if (version !== 'develop' && version !== 'trial') return;
    const log = tag === '[HTTP FAIL]' ? console.error : console.info;
    log.call(console, tag, { ...buildFields(), envVersion: version });
  } catch (_) {
    // Diagnostics must not change login/request behavior, including on old SDKs.
  }
}

function httpResponse({ url, method, statusCode }) {
  emit('[HTTP RESPONSE]', () => ({
    url: safeText(url),
    method,
    statusCode,
  }));
}

function httpFail({ url, method, error, data, header }) {
  emit('[HTTP FAIL]', () => ({
    url: safeText(url),
    method,
    errMsg: safeText(error && error.errMsg, [
      ...collectStrings(data),
      ...collectStrings(header),
    ]),
  }));
}

function loginEvent(stage, error) {
  emit('[WECHAT LOGIN]', () => ({
    stage,
    ...(error ? { errMsg: safeText(error.errMsg) } : {}),
  }));
}

module.exports = { httpResponse, httpFail, loginEvent };
