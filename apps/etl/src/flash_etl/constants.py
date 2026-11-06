"""Static business constants — ported from protocol.md.

These are the LOCKED definitions. Do not change revenue definition,
SBU remap, or the freight set without finance sign-off.
"""

# Revenue income-statement sub-schedule GL codes (NOT 3010003/3010004).
GL_REVENUE = ("3010001", "3010002", "3010005", "3010006")

# Sales Local (primary), Sales Foreign, Freight, Agency.
GL_SALES_LOCAL = "3010001"
GL_SALES_FOREIGN = "3010002"
GL_FREIGHT = "3010005"
GL_AGENCY = "3010006"
GL_OTHER_INCOME = "3010004"  # non-operating, full-GL side only

# Marketing spend (expense) — feeds the Marketing Analysis tab (ROMI).
GL_MARKETING = "4210001"

# Unallocated cement deliveries (intSBUId=0) map to NXCM.
SBU_UNALLOCATED = 0
SBU_ACCL = 58

# Recon-only entities: excluded from report scope, included in full-GL side.
RECON_ONLY_SBUS = {103, 116, 119, 122, 111}

# Freight / shipping SBUs (GL 3010005).
FREIGHT_SBUS = {64, 79, 80, 81, 88, 110}

# NXAB (98) distribution-channel split.
# 111=Asphalt, 130=Bitumen fold into the "asphalt" bucket; 125=Lubricants and
# 128/129=B2B/B2C Lube Oil fold into the "lubex" bucket (the tracker calls the
# lube business "Lubex" — there is no DWH channel literally named "Lubex").
NXAB_ID = 98
NXAB_ASPHALT_CHANNELS = {111, 130}
NXAB_LUBEX_CHANNELS = {125, 128, 129}

# SBU ID -> report code.
SBU_MAP: dict[int, str] = {
    19: "NXPL", 36: "NXES", 58: "NXCM", 64: "NXSL", 69: "NXRM",
    72: "NXCL1", 77: "NXCL2", 79: "NXOC", 80: "NXSL1",
    81: "NXMT", 82: "NXBO", 83: "NXBP", 84: "NXIT", 86: "NXHM",
    87: "NXFL", 88: "NXSE", 91: "NXNT", 98: "NXAB", 99: "NXAL",
    102: "NXST", 109: "NXAF", 110: "NXSC", 114: "NXLE", 115: "NXAI",
    118: "NXAT", 120: "NXEF", 123: "NXEN", 124: "NXBL", 126: "NXOR",
    128: "NXMX", 129: "NXNJ", 132: "NXMP",
}

# All SBUs in canonical report order.
SORTED_SBU_IDS = [
    19, 36, 58, 64, 69, 72, 77, 79, 80, 81, 82, 83, 84, 86, 87, 88,
    91, 98, 99, 102, 109, 110, 114, 115, 118, 120, 123, 124, 126, 128, 129, 132,
]

# Known override candidates: GL revenue persistently gaps the user's portal.
OVERRIDE_SBUS = {124: "NXBL", 126: "NXOR"}

# DWH currency divisor: numAmount is in units of 1e-7 (10,000,000 = 1 Cr).
CR_DIVISOR = 10_000_000.0
