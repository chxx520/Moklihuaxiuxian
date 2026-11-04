import UIKit
import WebKit

/// 用全屏 WKWebView 运行打包在 App 内的网页内核（www/index.html）。
/// 存档通过原生桥写入 App 的 Documents/saves.json，启动时注入回网页。
final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    private var webView: WKWebView!

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

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.08, green: 0.10, blue: 0.11, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") else {
            webView.loadHTMLString("<h2 style='color:#fff'>找不到 www/index.html</h2>", baseURL: nil)
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
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
        do {
            try json.data(using: .utf8)?.write(to: saveURL, options: .atomic)
        } catch {
            NSLog("归山：存档写入失败 \(error)")
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
