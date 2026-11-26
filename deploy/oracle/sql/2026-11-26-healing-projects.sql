-- Link healing events recorded before HealingEvent.projectId existed to their
-- project, by matching the event's page host to a project's web app host.
-- Only hosts used by exactly one project are linked (no guessing).
WITH host_projects AS (
  SELECT lower(split_part(split_part("webAppUrl", '/', 3), ':', 1)) AS host, min(id) AS project_id, count(*) AS n
  FROM "Project"
  WHERE "webAppUrl" LIKE 'http%'
  GROUP BY 1
)
UPDATE "HealingEvent" e
SET "projectId" = hp.project_id
FROM host_projects hp
WHERE e."projectId" IS NULL
  AND hp.n = 1
  AND lower(split_part(split_part(e."pageUrl", '/', 3), ':', 1)) = hp.host;
