import { faker, fakerAR } from "@faker-js/faker";

export interface TestDataProfile {
  name: string;
  description: string;
  data: Record<string, string>;
}

function getFaker(locale: string = "en") {
  return locale === "ar" ? fakerAR : faker;
}

/**
 * Generate realistic test data for various scenarios
 */
export function generateTestData(profile: string, locale: string = "en"): TestDataProfile {
  const f = getFaker(locale);

  switch (profile) {
    case "user_registration":
      return {
        name: "User Registration",
        description: "Valid user registration data",
        data: {
          fullName: f.person.fullName(),
          email: f.internet.email(),
          username: f.internet.username(),
          password: f.internet.password({ length: 12, memorable: false }),
          phone: f.phone.number(),
          dateOfBirth: f.date.birthdate({ min: 18, max: 65, mode: "age" }).toISOString().split("T")[0],
          address: f.location.streetAddress(),
          city: f.location.city(),
          country: f.location.country(),
        },
      };

    case "invalid_email":
      return {
        name: "Invalid Email",
        description: "Invalid email formats for negative testing",
        data: {
          missingAt: "userexample.com",
          missingDomain: "user@",
          spaces: "user name@example.com",
          doubleAt: "user@@example.com",
          noUsername: "@example.com",
          specialChars: "user<>@example.com",
        },
      };

    case "payment":
      return {
        name: "Payment Data",
        description: "Valid and invalid payment test data",
        data: {
          cardNumber: f.finance.creditCardNumber("4###############"), // Visa
          expiryDate: `${f.number.int({ min: 1, max: 12 }).toString().padStart(2, "0")}/${f.number.int({ min: 26, max: 30 })}`,
          cvv: f.number.int({ min: 100, max: 999 }).toString(),
          cardHolder: f.person.fullName(),
          invalidCard: "1234567890123456",
          expiredDate: "01/20",
          shortCvv: "12",
        },
      };

    case "search":
      return {
        name: "Search Test Data",
        description: "Various search query patterns",
        data: {
          exactMatch: f.commerce.productName(),
          partialMatch: f.commerce.productName().substring(0, 3),
          specialChars: "test!@#$%^&*()",
          sqlInjection: "' OR '1'='1",
          xssAttempt: "<script>alert('xss')</script>",
          longQuery: f.lorem.words(50),
          emptyQuery: "",
          unicode: "测试搜索",
          numbersOnly: f.string.numeric(10),
        },
      };

    case "arabic_user": {
      const ar = getFaker("ar");
      return {
        name: "Arabic User Data",
        description: "Arabic user registration test data",
        data: {
          fullName: ar.person.fullName(),
          email: ar.internet.email(),
          phone: "+9665" + f.string.numeric(8),
          address: ar.location.streetAddress(),
          city: ar.location.city(),
          company: ar.company.name(),
        },
      };
    }

    case "boundary":
      return {
        name: "Boundary Values",
        description: "Common boundary value test data",
        data: {
          minLength: "a",
          maxLength: f.string.alphanumeric(255),
          empty: "",
          null: "null",
          zero: "0",
          negative: "-1",
          veryLarge: "999999999999999999999999999999",
          whitespace: "   ",
          unicode: "🚀🌟✨",
          htmlTags: "<b>bold</b><i>italic</i>",
        },
      };

    default: {
      const ff = getFaker(locale);
      return {
        name: "General Data",
        description: "General-purpose test data",
        data: {
          name: ff.person.fullName(),
          email: ff.internet.email(),
          phone: ff.phone.number(),
          company: ff.company.name(),
          address: ff.location.streetAddress(),
          url: ff.internet.url(),
          ip: ff.internet.ipv4(),
          uuid: ff.string.uuid(),
        },
      };
    }
  }
}

/**
 * Get all available test data profiles
 */
export function getTestDataProfiles(): { id: string; name: string; description: string }[] {
  return [
    { id: "user_registration", name: "User Registration", description: "Valid user registration data" },
    { id: "invalid_email", name: "Invalid Email", description: "Invalid email formats for negative testing" },
    { id: "payment", name: "Payment Data", description: "Valid and invalid payment test data" },
    { id: "search", name: "Search Test Data", description: "Various search query patterns" },
    { id: "arabic_user", name: "Arabic User Data", description: "Arabic user registration test data" },
    { id: "boundary", name: "Boundary Values", description: "Common boundary value test data" },
    { id: "general", name: "General Data", description: "General-purpose test data" },
  ];
}

/**
 * Generate random data for a specific field type
 */
export function generateFieldValue(fieldType: string, locale: string = "en"): string {
  const f = getFaker(locale);
  switch (fieldType) {
    case "name":
      return f.person.fullName();
    case "email":
      return f.internet.email();
    case "phone":
      return f.phone.number();
    case "address":
      return f.location.streetAddress();
    case "city":
      return f.location.city();
    case "country":
      return f.location.country();
    case "company":
      return f.company.name();
    case "url":
      return f.internet.url();
    case "password":
      return f.internet.password({ length: 12 });
    case "uuid":
      return f.string.uuid();
    case "number":
      return f.number.int({ min: 1, max: 1000 }).toString();
    case "date":
      return f.date.recent().toISOString().split("T")[0];
    case "datetime":
      return f.date.recent().toISOString();
    case "text":
      return f.lorem.sentence();
    case "paragraph":
      return f.lorem.paragraph();
    default:
      return f.string.alphanumeric(10);
  }
}
