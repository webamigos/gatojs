import { test } from "@fast-check/vitest";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectNames } from "../project-names.js";

const slugArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{1,49}$/);

describe("projectNames", () => {
  it("slug z basename sciezki, nazwa wyswietlana ze sluga", () => {
    expect(projectNames("/tmp/acme-shop", null)).toEqual({
      name: "Acme Shop",
      slug: "acme-shop",
      snake: "acme_shop",
    });
  });

  it("tytul zastepuje nazwe wyswietlana", () => {
    expect(projectNames("/tmp/acme-shop", "ACME Sklep")).toEqual({
      name: "ACME Sklep",
      slug: "acme-shop",
      snake: "acme_shop",
    });
  });

  it("slug dwuznakowy jest poprawny a nazwa ma wielka litere", () => {
    expect(projectNames("ab", null)).toEqual({
      name: "Ab",
      slug: "ab",
      snake: "ab",
    });
  });

  it("cyfra po pierwszej literze i myslnik sa poprawne", () => {
    expect(projectNames("a-1", null)).toEqual({
      name: "A 1",
      slug: "a-1",
      snake: "a_1",
    });
  });

  it("slug z 50 znakow jest poprawny", () => {
    const slug = `a${"b".repeat(49)}`;
    expect(projectNames(slug, null).slug).toBe(slug);
  });

  it("kazde slowo po myslniku zaczyna sie wielka litera", () => {
    expect(projectNames("my-big-app", null).name).toBe("My Big App");
  });

  it("sciezka wzgledna w katalogu nadrzednym: slug tylko z basename", () => {
    expect(projectNames("../xy", null)).toEqual({
      name: "Xy",
      slug: "xy",
      snake: "xy",
    });
  });

  it("koncowy ukosnik nie zmienia sluga", () => {
    expect(projectNames("/tmp/acme-shop/", null).slug).toBe("acme-shop");
  });

  it.each([
    "a",
    "x".repeat(51),
    "1app",
    "Moja Apka",
    "acme_shop",
    "Acme",
    "../x",
    "-ab",
    "ab!",
    "acmE",
    "ab.c",
    "ab c",
  ])("nazwa %j odrzucona", (bad) => {
    expect(() => projectNames(bad, null)).toThrow(
      "use lowercase letters, digits and hyphens, start with a letter, 2–50 characters",
    );
  });

  it("komunikat zawiera odrzucony slug", () => {
    expect(() => projectNames("/tmp/Moja", null)).toThrow(
      'Project name "Moja": use lowercase letters, digits and hyphens, start with a letter, 2–50 characters',
    );
  });

  it("slug z koncowa nowa linia jest odrzucony", () => {
    expect(() => projectNames("ab\n", null)).toThrow("use lowercase letters");
  });

  test.prop([slugArbitrary])(
    "snake nie zawiera myslnika i odtwarza slug",
    (slug) => {
      const names = projectNames(`/tmp/${slug}`, null);
      expect(names.slug).toBe(slug);
      expect(names.snake).not.toContain("-");
      expect(names.snake.replaceAll("_", "-")).toBe(slug);
    },
  );
});
