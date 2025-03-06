## prepare
先安装bun 
```
https://bun.sh/docs/installation
```
再安装需要的库
```sh
bun install puppeteer dotenv
npx puppeteer browsers install chrome
```
添加.env文件,内容为
```code
CODECHEF_USERNAME=username
CODECHEF_PASSWORD=password
```

## usage

修改spider.js中的这两个字段为要爬的题目,例如`https://www.codechef.com/INTGRA01/status/MAXDIFF`, CATEGORY为INTGRA01，PROBLEM_ID为MAXDIFF

```code
const PROBLEM_ID = "MAXDIFF"
const CATEGORY = "INTGRA01"
```

可以运行了
```sh
bun run sipder.js
```