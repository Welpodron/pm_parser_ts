import { Builder, By, WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import ObjectsToCsv from "objects-to-csv";

const PARSER_SITE_ROOT_URL = "https://pm.ru";
const PARSER_PARSING_PATHS = [
  "/category/mebel-dlya-doma/krovati/odnospalnye-krovati/",
];
const PARSER_LINKS_MAX = 1000;
const PARSER_MIN_SLEEP_TIME_MS = 3500;
const PARSER_MAX_SLEEP_TIME_MS = 12000;
const REVIEWS_MAX = 1000;
const REVIEWS_PER_LINK_MAX = 3;
const REVIEWS_RATING = 5;
const REVIEWS_IMAGES_DELIMITER = "|";

// Селектор элемента, который содержит автора отзыва на продукт на детальной странице
const SELECTOR_PRODUCT_DETAIL_REVIEW_AUTHOR = ".opinion__author span";
// Селектор элемента, который содержит отзыв на продукт на детальной странице
const SELECTOR_PRODUCT_DETAIL_REVIEW = ".opinion";
// Селектор элемента, который содержит название продукта на детальной странице
const SELECTOR_PRODUCT_DETAIL_NAME = "h1";
// Селектор инпута, который содержит good-id (артикул???) на детальной странице
const SELECTOR_PRODUCT_DETAIL_ID = "#cart-good-id";
// Селектор детальной ссылки элемента на странице категории
const SELECTOR_PRODUCT_CATEGORY_DETAIL_LINK = "a:first-of-type.good__link";
// Селектор счетчика отзывов элемента на странице категории
const SELECTOR_PRODUCT_CATEGORY_REVIEWS_COUNTER = ".good__opinions-number";
// Селектор элемента (карточки) на странице категории
const SELECTOR_PRODUCT_CATEGORY = ".good__item";
// Селектор ссылки в пагинации на следующую страницу
const SELECTOR_PAGINATION_SELECTOR_NEXT = ".lister-next a";

interface IReview {
  product_url: string;
  product_name: string;
  product_id: string;
  review_author: string;
  review_date: string;
  review_comment: string;
  review_advantages: string;
  review_disadvantages: string;
  review_rating: string;
  review_images: string;
}

const links = new Set<string>();
const reviews = new Set<IReview>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const collectLinks = async (driver: WebDriver) => {
  if (links.size > PARSER_LINKS_MAX) {
    return;
  }

  try {
    const els = await driver.findElements(By.css(SELECTOR_PRODUCT_CATEGORY));

    for (const el of els) {
      try {
        await el.findElement(By.css(SELECTOR_PRODUCT_CATEGORY_REVIEWS_COUNTER));

        const linkEl = await el.findElement(
          By.css(SELECTOR_PRODUCT_CATEGORY_DETAIL_LINK)
        );

        const link = await linkEl.getAttribute("href");

        if (link && link.trim()) {
          links.add(link);
        }
      } catch (_) {
        continue;
      }
    }
  } catch (error) {
    console.error(error);
  }
};

const paginate = async (driver: WebDriver) => {
  try {
    await collectLinks(driver);

    const paginationNextEl = await driver.findElement(
      By.css(SELECTOR_PAGINATION_SELECTOR_NEXT)
    );

    await paginationNextEl.click();

    await paginate(driver);
  } catch (_) {
    return;
  }
};

const parsePage = async (driver: WebDriver, url: string) => {
  if (reviews.size > REVIEWS_MAX) {
    return;
  }

  const sleepTime =
    Math.random() * (PARSER_MAX_SLEEP_TIME_MS - PARSER_MIN_SLEEP_TIME_MS) +
    PARSER_MIN_SLEEP_TIME_MS;

  console.log(
    `[DEBUG][SLEEP] Начат процесс ожидания длительностью: ${
      sleepTime / 1000
    } секунд`
  );

  await sleep(sleepTime);

  console.log(`[DEBUG][SLEEP] Завершен процесс ожидания`);

  console.log(`[DEBUG][PAGE] Начат парсинг: ${url}`);

  try {
    await driver.get(url);

    const productIdEl = await driver.findElement(
      By.css(SELECTOR_PRODUCT_DETAIL_ID)
    );
    const productNameEl = await driver.findElement(
      By.css(SELECTOR_PRODUCT_DETAIL_NAME)
    );

    const productId = await productIdEl.getAttribute("value");
    const productName = await productNameEl.getAttribute("innerText");

    const opinionEls = await driver.findElements(
      By.css(
        `${SELECTOR_PRODUCT_DETAIL_REVIEW}[data-sort-rating="${REVIEWS_RATING}"]:nth-child(-n+${REVIEWS_PER_LINK_MAX})`
      )
    );

    for (const opinionEl of opinionEls) {
      const review: IReview = {
        product_url: url,
        product_name: productName,
        product_id: productId,
        review_author: "",
        review_date: "",
        review_comment: "",
        review_advantages: "",
        review_disadvantages: "",
        review_rating: "5",
        review_images: "",
      };

      const authorEl = await opinionEl.findElement(
        By.css(SELECTOR_PRODUCT_DETAIL_REVIEW_AUTHOR)
      );

      review.review_author = await authorEl.getAttribute("innerText");

      const dateRaw = await opinionEl.getAttribute("data-sort-date");
      const dateYear = dateRaw.slice(0, 4);
      const dateMonth = dateRaw.slice(4, 6);
      const dateDay = dateRaw.slice(6, 8);
      const dateHour = dateRaw.slice(8, 10);
      const dateMinute = dateRaw.slice(10, 12);
      const dateSecond = dateRaw.slice(12, 14);

      review.review_date = `${dateDay}.${dateMonth}.${dateYear} ${dateHour}:${dateMinute}:${dateSecond}`;

      const opinionDescEl = await opinionEl.findElement(
        By.css(".opinion__desc-block")
      );

      try {
        const commentEl = await opinionDescEl.findElement(
          By.xpath("h4[contains(text(),'Отзыв')]//following-sibling::p[1]")
        );
        review.review_comment = await commentEl.getAttribute("innerText");
      } catch (_) {}

      try {
        const advantagesEl = await opinionDescEl.findElement(
          By.xpath(
            "h4[contains(text(),'Достоинства')]//following-sibling::p[1]"
          )
        );
        review.review_advantages = await advantagesEl.getAttribute("innerText");
      } catch (_) {}

      try {
        const disadvantagesEl = await opinionDescEl.findElement(
          By.xpath("h4[contains(text(),'Недостатки')]//following-sibling::p[1]")
        );
        review.review_disadvantages = await disadvantagesEl.getAttribute(
          "innerText"
        );
      } catch (_) {}

      try {
        const photos: string[] = [];

        const photoEls = await opinionEl.findElements(
          By.css(".opinion__photo")
        );

        for (const photoEl of photoEls) {
          const photoLinkRelativePath = await photoEl.getAttribute(
            "data-image-original"
          );

          photos.push(PARSER_SITE_ROOT_URL + photoLinkRelativePath.trim());
        }

        review.review_images = photos.join(REVIEWS_IMAGES_DELIMITER);
      } catch (_) {}

      reviews.add(review);
    }
  } catch (_) {
    // So opinions was not found or driver cant get url
  } finally {
    console.log(`[DEBUG][PAGE] Завершен парсинг: ${url}`);
  }
};

(async () => {
  const parserStartTime = performance.now();

  const chromeOptions = new chrome.Options();
  chromeOptions.addArguments(
    "--headless",
    "--log-level=3",
    "--ignore-certificate-errors",
    "--ignore-ssl-errors"
  );

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(chromeOptions)
    .build();

  try {
    for (const path of PARSER_PARSING_PATHS) {
      console.log(
        `[DEBUG][PAGINATION] Начат процесс пагинации и сбора ссылок для: ${
          PARSER_SITE_ROOT_URL + path
        }`
      );

      await driver.get(PARSER_SITE_ROOT_URL + path);

      await paginate(driver);

      console.log(
        `[DEBUG][PAGINATION] Завершен процесс пагинации и сбора ссылок для: ${
          PARSER_SITE_ROOT_URL + path
        }`
      );
    }

    console.log(
      `[DEBUG][PAGINATION] Всего найдено уникальных ссылок: ${links.size}`
    );

    for (const link of links) {
      await parsePage(driver, link);
    }

    const reviewsArray = Array.from(reviews);

    if (reviewsArray.length) {
      const csv = new ObjectsToCsv(reviewsArray);

      const now = new Date();

      await csv.toDisk(
        `./Результат парсинга ${("0" + now.getDate()).slice(-2)}.${(
          "0" +
          (now.getMonth() + 1)
        ).slice(
          -2
        )}.${now.getFullYear()} ${now.getHours()}_${now.getMinutes()}_${now.getSeconds()}.csv`
      );
    }
  } catch (error) {
    console.error(error);
  } finally {
    const parserEndTime = performance.now();

    console.log(
      `[DEBUG][PERFORMANCE] Парсер завершил работу за: ${Math.ceil(
        (parserEndTime - parserStartTime) / 1000 / 60
      )} минут`
    );

    await driver.quit();
  }
})();
