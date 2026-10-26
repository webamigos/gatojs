export const TABLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const TABLE_DEFAULT_PAGE_SIZE: (typeof TABLE_PAGE_SIZE_OPTIONS)[number] = 50;

export const TABLE_PAGE_SIZE_COOKIE = "table_page_size";
