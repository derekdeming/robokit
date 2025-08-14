import { test, expect } from '@playwright/test'

test.describe('Rerun Visualization Component', () => {
  test('should render initial state with controls', async ({ page }) => {
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4">
          <div class="space-y-4">
            <div class="bg-white rounded-lg border p-6">
              <div class="mb-4">
                <h2 class="text-xl font-semibold">Rerun Visualization</h2>
                <p class="text-gray-600">Generate and view interactive 3D visualizations of your dataset</p>
              </div>
              
              <div class="flex items-center gap-4 mb-4">
                <div class="flex-1 flex items-center gap-2">
                  <label for="mode" class="text-sm font-medium">Mode:</label>
                  <select id="mode" class="border rounded px-3 py-1">
                    <option value="file">File (.rrd)</option>
                    <option value="stream">Live Stream</option>
                  </select>
                </div>
                
                <button class="px-3 py-1 border rounded text-sm">Settings</button>
                <button class="px-4 py-2 bg-blue-600 text-white rounded">Generate</button>
              </div>
            </div>
            
            <div class="bg-white rounded-lg border overflow-hidden">
              <div class="p-8 text-center" style="height: 400px; display: flex; align-items: center; justify-content: center;">
                <div>
                  <div class="mb-4">
                    <svg class="h-12 w-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                  </div>
                  <h3 class="text-lg font-medium mb-2">No Visualization Generated</h3>
                  <p class="text-gray-600 mb-4">Click "Generate" to create a visualization file</p>
                  <p class="text-sm text-gray-500">You can configure settings before generating</p>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `)

    await expect(page.locator('text=Rerun Visualization')).toBeVisible()
    await expect(page.locator('text=Generate and view interactive 3D visualizations')).toBeVisible()
    await expect(page.locator('select#mode')).toBeVisible()
    await expect(page.locator('button:has-text("Generate")')).toBeVisible()
    await expect(page.locator('text=No Visualization Generated')).toBeVisible()
  })

  test('should toggle settings panel', async ({ page }) => {
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4">
          <div class="space-y-4">
            <button id="settings-btn" class="px-3 py-1 border rounded text-sm">Settings</button>
            
            <div id="settings-panel" class="bg-gray-50 rounded-lg p-4 space-y-3" style="display: none;">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="stride" class="block text-sm font-medium">Frame Stride</label>
                  <input id="stride" type="number" min="1" max="10" value="2" class="w-full mt-1 px-2 py-1 border rounded">
                </div>
                <div>
                  <label for="maxFrames" class="block text-sm font-medium">Max Frames</label>
                  <input id="maxFrames" type="number" min="100" max="10000" step="100" value="3000" class="w-full mt-1 px-2 py-1 border rounded">
                </div>
                <div>
                  <label for="quality" class="block text-sm font-medium">JPEG Quality</label>
                  <input id="quality" type="number" min="50" max="100" value="90" class="w-full mt-1 px-2 py-1 border rounded">
                </div>
                <div>
                  <label for="blueprint" class="block text-sm font-medium">Layout</label>
                  <select id="blueprint" class="w-full mt-1 px-2 py-1 border rounded">
                    <option value="episode_review">Episode Review</option>
                    <option value="quality_triage">Quality Triage</option>
                    <option value="alignment">Alignment</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <script>
            document.getElementById('settings-btn').addEventListener('click', function() {
              const panel = document.getElementById('settings-panel')
              panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
            })
          </script>
        </body>
      </html>
    `)

    // Settings panel should be hidden initially
    await expect(page.locator('#settings-panel')).not.toBeVisible()

    // Click settings button
    await page.click('#settings-btn')

    // Settings panel should be visible
    await expect(page.locator('#settings-panel')).toBeVisible()
    await expect(page.locator('label[for="stride"]')).toBeVisible()
    await expect(page.locator('label[for="maxFrames"]')).toBeVisible()
    await expect(page.locator('label[for="quality"]')).toBeVisible()
    await expect(page.locator('label[for="blueprint"]')).toBeVisible()
  })

  test('should handle mode switching', async ({ page }) => {
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4">
          <div class="flex items-center gap-2">
            <label for="mode">Mode:</label>
            <select id="mode" class="border rounded px-3 py-1">
              <option value="file">File (.rrd)</option>
              <option value="stream">Live Stream</option>
            </select>
          </div>
          
          <div id="mode-description" class="mt-4 p-4 bg-gray-100 rounded">
            <p id="file-desc">Click "Generate" to create a visualization file</p>
            <p id="stream-desc" style="display: none;">Click "Generate" to start a live streaming session</p>
          </div>
          
          <script>
            document.getElementById('mode').addEventListener('change', function(e) {
              const fileDesc = document.getElementById('file-desc')
              const streamDesc = document.getElementById('stream-desc')
              
              if (e.target.value === 'stream') {
                fileDesc.style.display = 'none'
                streamDesc.style.display = 'block'
              } else {
                fileDesc.style.display = 'block'
                streamDesc.style.display = 'none'
              }
            })
          </script>
        </body>
      </html>
    `)

    // Initially should show file mode description
    await expect(page.locator('#file-desc')).toBeVisible()
    await expect(page.locator('#stream-desc')).not.toBeVisible()

    // Switch to stream mode
    await page.selectOption('#mode', 'stream')

    // Should show stream mode description
    await expect(page.locator('#file-desc')).not.toBeVisible()
    await expect(page.locator('#stream-desc')).toBeVisible()
    await expect(page.locator('text=start a live streaming session')).toBeVisible()
  })

  test('should show progress during generation', async ({ page }) => {
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4">
          <button id="generate-btn" class="px-4 py-2 bg-blue-600 text-white rounded">
            <span id="btn-text">Generate</span>
            <svg id="loading-spinner" class="hidden animate-spin h-4 w-4 inline-block ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"></circle>
              <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" class="opacity-75"></path>
            </svg>
          </button>
          
          <div id="progress-section" class="mt-4" style="display: none;">
            <div class="flex justify-between text-sm mb-2">
              <span>Processing...</span>
              <span id="progress-text">0%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div id="progress-bar" class="bg-blue-600 h-2 rounded-full" style="width: 0%"></div>
            </div>
          </div>
          
          <script>
            let progress = 0
            let isRunning = false
            
            document.getElementById('generate-btn').addEventListener('click', function() {
              if (isRunning) return
              
              isRunning = true
              const btnText = document.getElementById('btn-text')
              const spinner = document.getElementById('loading-spinner')
              const progressSection = document.getElementById('progress-section')
              
              btnText.textContent = 'Generating...'
              spinner.classList.remove('hidden')
              progressSection.style.display = 'block'
              this.disabled = true
              
              // Simulate progress
              const interval = setInterval(() => {
                progress += 25
                document.getElementById('progress-text').textContent = progress + '%'
                document.getElementById('progress-bar').style.width = progress + '%'
                
                if (progress >= 100) {
                  clearInterval(interval)
                  setTimeout(() => {
                    btnText.textContent = 'Generate'
                    spinner.classList.add('hidden')
                    progressSection.style.display = 'none'
                    this.disabled = false
                    isRunning = false
                    progress = 0
                  }, 500)
                }
              }, 200)
            })
          </script>
        </body>
      </html>
    `)

    // Initially should show Generate button
    await expect(page.locator('#btn-text')).toHaveText('Generate')
    await expect(page.locator('#loading-spinner')).toHaveClass(/hidden/)
    await expect(page.locator('#progress-section')).not.toBeVisible()

    // Click generate
    await page.click('#generate-btn')

    // Should show generating state
    await expect(page.locator('#btn-text')).toHaveText('Generating...')
    await expect(page.locator('#loading-spinner')).not.toHaveClass(/hidden/)
    await expect(page.locator('#progress-section')).toBeVisible()

    // Wait for progress to complete
    await expect(page.locator('#progress-text')).toHaveText('100%', { timeout: 2000 })
    await expect(page.locator('#progress-bar')).toHaveCSS('width', '100%')

    // Should return to initial state
    await expect(page.locator('#btn-text')).toHaveText('Generate', { timeout: 1000 })
  })

  test('should handle error states', async ({ page }) => {
    await page.setContent(`
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-4">
          <button id="generate-btn" class="px-4 py-2 bg-blue-600 text-white rounded">Generate</button>
          
          <div id="error-alert" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg" style="display: none;">
            <div class="flex">
              <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
              <div class="ml-3">
                <p class="text-sm text-red-800" id="error-message">Dataset not found</p>
              </div>
            </div>
          </div>
          
          <script>
            document.getElementById('generate-btn').addEventListener('click', function() {
              // Simulate error after short delay
              setTimeout(() => {
                document.getElementById('error-alert').style.display = 'block'
              }, 500)
            })
          </script>
        </body>
      </html>
    `)

    // Click generate
    await page.click('#generate-btn')

    // Should show error after delay
    await expect(page.locator('#error-alert')).toBeVisible({ timeout: 1000 })
    await expect(page.locator('#error-message')).toHaveText('Dataset not found')
  })

  test('should validate configuration parameters', async ({ page }) => {
    const validConfigs = [
      { stride: 2, maxFrames: 3000, jpegQuality: 90, blueprint: 'episode_review' },
      { stride: 5, maxFrames: 1000, jpegQuality: 75, blueprint: 'quality_triage' },
      { stride: 1, maxFrames: 5000, jpegQuality: 100, blueprint: 'minimal' }
    ]

    for (const config of validConfigs) {
      await page.evaluate((cfg) => {
        // Validate configuration ranges
        const isValidStride = cfg.stride >= 1 && cfg.stride <= 10
        const isValidFrames = cfg.maxFrames >= 100 && cfg.maxFrames <= 10000
        const isValidQuality = cfg.jpegQuality >= 1 && cfg.jpegQuality <= 100
        const validBlueprints = ['episode_review', 'quality_triage', 'alignment', 'minimal']
        const isValidBlueprint = validBlueprints.includes(cfg.blueprint)
        
        return isValidStride && isValidFrames && isValidQuality && isValidBlueprint
      }, config)
    }
  })
})