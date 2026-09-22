# NOVA Business AI Widget Integration Guide

This guide explains how to properly integrate the NOVA Business AI widget into any website, and how to troubleshoot common issues.

## Step-by-Step Integration Procedure

1. **Get Your Widget Token:**
   - Log in to your Chatbot application dashboard (`https://chatbot-rakesh.vercel.app`).
   - Navigate to the **Projects** or **Widget Settings** page for your specific project.
   - Look for the **Widget Setup** or **Embed Code** section to copy your unique `<script>` tag. It will contain your unique `data-widget-token`.

2. **Add the Script to Your Website:**
   - Open the HTML file of the website where you want the chatbot to appear (for example, `index.html`).
   - Paste the copied `<script>` tag right before the closing `</body>` tag.
   - The script should look something like this:
     ```html
     <!-- NOVA Business AI Widget -->
     <script 
       src="https://chatbot-rakesh.vercel.app/widget.js?v=2"
       data-widget-token="YOUR_UNIQUE_WIDGET_TOKEN"
       data-api-url="https://chat-bot-api-ns81.onrender.com">
     </script>
     ```

3. **Configure Allowed Domains (CORS):**
   - In your Chatbot dashboard, ensure you have added the **Domain Name** of your target website to the "Allowed Domains" list (e.g., `suriya-portfolio-seven.vercel.app`).
   - If you are testing locally (e.g., opening an `index.html` file directly from your computer), the origin might be treated as `null`. The backend is configured to allow this for testing, but for production, always ensure your live domain is whitelisted.

4. **Verify API Keys (Important):**
   - The chatbot requires a valid AI provider API key (like Gemini or OpenAI) to function.
   - Go to your Chatbot dashboard and ensure you have added a valid API key in the **Integrations** or **Settings** section.
   - Make sure you select the correct, supported AI Model (e.g., `gemini-2.5-flash`).

## Troubleshooting Guide

If the widget is not appearing or responding:

- **Widget Does Not Render At All:**
  - Check the browser's developer console (F12 -> Console) for any Syntax Errors in `widget.js`.
  - Check the Network tab to see if the `/config` request failed with a `403 Forbidden` (meaning your domain isn't allowed) or a `500 Internal Server Error` (backend crashed).

- **Widget Appears, But Doesn't Reply (500 Error on `/chat`):**
  - **Invalid API Key:** If your API key is incorrect or expired, the AI provider will reject the request, causing the backend to throw a 500 error.
  - **Deprecated AI Model:** If you are using a deprecated model (like `gemini-1.5-flash`), the AI provider will return a "Model Not Found" error. Update your default model to the latest supported version (like `gemini-2.5-flash`).
  - **Encryption Issues:** The API keys are stored encrypted. The backend must properly decrypt them before sending them to the AI provider.

- **Cross-Origin Resource Sharing (CORS) Blocks:**
  - If you see CORS errors in the console, ensure the backend's `app.use("/api/widget", cors({ origin: "*" }))` middleware is registered *before* any strict security headers (like `helmet()`) or strict CORS middleware.
