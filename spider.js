const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
require("dotenv").config();

// 配置项
const USERNAME = process.env.CODECHEF_USERNAME;
const PASSWORD = process.env.CODECHEF_PASSWORD;
const STATE_DIR = path.join(__dirname, "state");
const LINK_FILE = path.join(STATE_DIR, "links.txt");
const PAGE_STATE_FILE = path.join(STATE_DIR, "page-state.json");
const PROCESSED_STATE_FILE = path.join(STATE_DIR, "processed-state.json");
const OUTPUT_DIR = path.join(__dirname, "solutions");

const PROBLEM_ID = "MAXDIFF"
const CATEGORY = "INTGRA01"

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState(filePath, defaultValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return defaultValue;
  }
}

function saveState(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractSolutionLinks(page) {
  const initialState = loadState(PAGE_STATE_FILE, { 
    page: 1,
    lastPage: null,
    baseUrl: `https://www.codechef.com/${CATEGORY}/status/${PROBLEM_ID}?language=C&limit=100`
  });

  let pageNumber = initialState.page;
  const links = [];

  while (pageNumber < 20) {
    console.log(initialState.baseUrl);
    console.log(`正在获取第 ${pageNumber} 页的链接...`);
    const url = `${initialState.baseUrl}&page=${pageNumber}`;
    
    try {
      sleep(20000)
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      
   
      await page.waitForSelector('tbody.MuiTableBody-root', { 
        visible: true,
        timeout: 60000 
      });

      // 提取当前页面的提交ID
      const pageLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('tbody.MuiTableBody-root tr'))
          .map(row => {
            const submissionId = row.querySelector('td')?.textContent?.trim();
            return submissionId && /^\d+$/.test(submissionId) 
              ? `https://www.codechef.com/viewsolution/${submissionId}`
              : null;
          })
          .filter(Boolean);
      });

      console.log(`第 ${pageNumber} 页找到 ${pageLinks.length} 个链接`);
      
 
      fs.appendFileSync(LINK_FILE, pageLinks.join("\n") + "\n");
      links.push(...pageLinks);


      saveState(PAGE_STATE_FILE, { 
        ...initialState,
        page: pageNumber,
        lastPage: pageNumber
      });

  
      const hasNextPage = await page.evaluate(() => {
        const nextButton = document.querySelector('button[aria-label="Next Page"]');
        return nextButton && !nextButton.disabled;
      });

      if (!hasNextPage || pageLinks.length === 0) break;

      pageNumber++;
      await sleep(5000 + Math.random() * 3000); 
    } catch (error) {
      console.error(`获取第 ${pageNumber} 页失败:`, error.message);
      throw error; 
    }
  }

  return links;
}

function saveSourceCode( status, submissionId, code, language) {
  const statusDir = status.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const langExt = {
    "C": "c",
    "C++14": "cpp",
    "C++17": "cpp",
    "PYTH 3": "py",
    "JAVA": "java"
  }[language] || "c";

  const outputPath = path.join(
    OUTPUT_DIR,
    PROBLEM_ID,
    statusDir,
    `${submissionId}.${langExt}`
  );

  
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

 
  fs.writeFileSync(outputPath, code);
  console.log(`已保存: ${outputPath}`);
}

async function processSolutions(browser) {

  if (!fs.existsSync(LINK_FILE)) return;
  const allLinks = fs.readFileSync(LINK_FILE, "utf8")
    .split("\n")
    .filter(Boolean);


  const processedState = loadState(PROCESSED_STATE_FILE, {
    processed: [],
    currentIndex: 0
  });


  const unprocessedLinks = allLinks
    .slice(processedState.currentIndex)
    .filter(link => !processedState.processed.includes(link));


  for (const [index, link] of unprocessedLinks.entries()) {
    const page = await browser.newPage();
    try {
      // console.log(`currentindex : ${processedState.currentIndex} , index : ${index} `)
      console.log(`正在处理 (${processedState.currentIndex + 1}/${allLinks.length}): ${link}`);
      
      await page.goto(link, { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });


      const submissionId = link.match(/\/viewsolution\/(\d+)/)[1];
      const [status, problemId, language] = await Promise.all([
        page.$eval('div[class*="_status_container"] > span', el => el.textContent.trim()),
   
        page.$eval('div[class*="_ideLanguageName"]', el => el.textContent.trim())
      ]);
  

      const sourcePage = await browser.newPage();
      await sourcePage.goto(`https://www.codechef.com/viewplaintext/${submissionId}`, {
        waitUntil: 'networkidle2'
      });
      const sourceCode = await sourcePage.$eval("body", el => el.innerText);
      await sourcePage.close();

 
      saveSourceCode( status, submissionId, sourceCode, language);

 
      processedState.processed.push(link);
      processedState.currentIndex = allLinks.indexOf(link) + 1;
      saveState(PROCESSED_STATE_FILE, processedState);

      await sleep(10000 + Math.random() * 2000);
    } catch (error) {
      console.error(`处理失败 (${link}):`, error.message);

      saveState(PROCESSED_STATE_FILE, {
        processed: processedState.processed,
        currentIndex: allLinks.indexOf(link)
      });
      throw error; 
    } finally {
      await page.close();
    }
  }
}


async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await initializePage(page);

    await login(page);

    const resume = process.argv.includes('--resume');
    // 第一阶段：获取所有提交链接
    if (!resume && !fs.existsSync(LINK_FILE)) {
      console.log("开始获取提交链接...");
      await extractSolutionLinks(page);
    }


    // 第二阶段：处理提交
    console.log("开始处理提交...");
    await processSolutions(browser);

    console.log("所有任务已完成");
  } finally {
    await browser.close();
  }
}


async function initializePage(page) {
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9"
  });
}

async function checkLoggedIn(page) {
  await page.goto("https://www.codechef.com/", { waitUntil: 'networkidle2' });
  return page.$('a[href*="/logout"]').then(() => true).catch(() => false);
}

async function login(page) {
	console.log("开始登录...");
	await page.goto("https://www.codechef.com/login", { waitUntil: "networkidle2" });

	// 处理Cookie同意按钮
	try {
		await page.waitForSelector("#gdpr-i-love-cookies", { timeout: 5000 });
		await page.click("#gdpr-i-love-cookies");
	} catch (e) {
		console.log("没有找到Cookie同意按钮或已经同意");
	}

	// 输入登录信息
	await page.waitForSelector('#ajax-login-form input[name="name"]');
	await page.type('#ajax-login-form input[name="name"]', USERNAME, { delay: 100 });
	await page.type('#ajax-login-form input[name="pass"]', PASSWORD, { delay: 100 });
	
	// 点击登录按钮并等待导航
	await Promise.all([
		page.click('#ajax-login-form input[name="op"]'),
		page.waitForNavigation({ waitUntil: "networkidle2" })
	]);

	console.log("登录成功，开始获取提交链接...");
}

main().catch(error => {
  console.error("运行失败:", error);
  process.exit(1);
});