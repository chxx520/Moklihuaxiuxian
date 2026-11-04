import UIKit
import WebKit

/// 用全屏 WKWebView 运行打包在 App 内的网页内核（www/）。
/// 页面通过自定义地址 guishan://app/ 加载：所有资源同源，WebGL 才能读取立绘做动画。
/// 存档通过原生桥写入 App 的 Documents/saves.json，启动时注入回网页。
final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!
    private let saveQueue = DispatchQueue(label: "guishan.save", qos: .utility)

    private var saveURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("saves.json")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override func loadView() {
        let controller = WKUserContentController()
        controller.add(self, name: "store")
        controller.addUserScript(WKUserScript(source: bootstrapScript(),
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.91, green: 0.88, blue: 0.82, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!))
    }

    /// 页面加载前注入：标记原生环境，并带上上次的存档。
    private func bootstrapScript() -> String {
        var saved = "null"
        if let data = try? Data(contentsOf: saveURL),
           (try? JSONSerialization.jsonObject(with: data)) != nil,
           let text = String(data: data, encoding: .utf8) {
            saved = text
        }
        return "window.__NATIVE__ = true; window.__NATIVE_SAVE__ = \(saved);"
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "store", let json = message.body as? String else { return }
        let url = saveURL
        saveQueue.async {
            do {
                try json.data(using: .utf8)?.write(to: url, options: .atomic)
            } catch {
                NSLog("归山：存档写入失败 \(error)")
            }
        }
    }

    // 网页进程被系统回收时自动重新加载（存档在原生侧，不会丢）
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        controller.addUserScript(WKUserScript(source: bootstrapScript(),
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
        webView.reload()
    }
}

/// 从 App 包里的 www/ 目录读取文件，响应 guishan://app/... 请求。
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "guishan"
    private let root = Bundle.main.url(forResource: "www", withExtension: nil)!

    private static let types: [String: String] = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
        "json": "application/json", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
        "svg": "image/svg+xml", "woff2": "font/woff2", "mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg", "txt": "text/plain; charset=utf-8",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path.removingPercentEncoding ?? url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!)
            task.didFinish()
            return
        }
        let type = Self.types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        var headers = ["Content-Type": type, "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes", "Cache-Control": "max-age=31536000"]
        // 音频播放会发分段请求（Range），需要按区间返回
        if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
            let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            let start = Int(parts.first ?? "") ?? 0
            var end = parts.count > 1 ? (Int(parts[1]) ?? data.count - 1) : data.count - 1
            end = min(end, data.count - 1)
            if start <= end {
                let chunk = data.subdata(in: start..<(end + 1))
                headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)"
                headers["Content-Length"] = String(chunk.count)
                task.didReceive(HTTPURLResponse(url: url, statusCode: 206, httpVersion: "HTTP/1.1", headerFields: headers)!)
                task.didReceive(chunk)
                task.didFinish()
                return
            }
        }
        headers["Content-Length"] = String(data.count)
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
