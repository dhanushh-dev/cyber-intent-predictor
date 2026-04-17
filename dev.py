import http.server
import socketserver
import json
import os
import importlib.util

PORT = 8000

class VercelLocalHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith('/api/') or self.path.startswith('/predict_intent'):
            self.handle_python_api('POST')
        else:
            super().do_POST()

    def do_GET(self):
        # Specific rewrites to match vercel.json
        if self.path == '/fetch_emails' or self.path == '/api/fetch_emails':
            self.path = '/api/fetch_emails'
            self.handle_python_api('GET')
        elif self.path == '/predict_intent' or self.path == '/api/predict_intent':
            self.path = '/api/predict_intent'
            self.handle_python_api('POST')
        elif self.path == '/analytics' or self.path == '/api/analytics':
            self.path = '/api/analytics'
            self.handle_python_api('GET')
        else:
            super().do_GET()

    def handle_python_api(self, method):
        # Resolve path to file
        module_name = self.path.split('?')[0].strip('/')
        if not module_name.endswith('.py'):
            file_path = os.path.join(os.getcwd(), module_name + '.py')
        else:
            file_path = os.path.join(os.getcwd(), module_name)

        if os.path.exists(file_path):
            try:
                spec = importlib.util.spec_from_file_location("module.name", file_path)
                foo = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(foo)
                
                # Instantiate handler class from the api file
                handler_inst = foo.handler(self.request, self.client_address, self.server)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"API Error: {str(e)}".encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"API Route Not Found")

print("\n[SUCCESS] LOCAL SERVERLESS ENVIRONMENT READY")
print(f">> URL: http://localhost:{PORT}")
print(">> API Root: /api/\n")


with socketserver.TCPServer(("", PORT), VercelLocalHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.shutdown()
