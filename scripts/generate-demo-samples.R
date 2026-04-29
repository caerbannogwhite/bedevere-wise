#!/usr/bin/env Rscript
# Reproducibly emits Penguins to .sav / .dta / .parquet under testfiles/.
# Used for the multi-format-hop demo recording.
#
# Run: Rscript scripts/generate-demo-samples.R
# Requires: palmerpenguins, haven, arrow.

required <- c("palmerpenguins", "haven", "arrow")
missing  <- setdiff(required, rownames(installed.packages()))
if (length(missing) > 0) {
  install.packages(missing, repos = "https://cloud.r-project.org")
}

suppressPackageStartupMessages({
  library(palmerpenguins)
  library(haven)
  library(arrow)
})

dir.create("testfiles", showWarnings = FALSE, recursive = TRUE)

write_sav(penguins, "testfiles/penguins.sav")
write_dta(penguins, "testfiles/penguins.dta")
write_parquet(penguins, "testfiles/penguins.parquet")

cat("Wrote: testfiles/penguins.{sav,dta,parquet}\n")
