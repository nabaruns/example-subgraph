import { BigDecimal, BigInt, Address } from "@graphprotocol/graph-ts";

export enum EventType {
  InitAsset,
  Deposit,
  Withdraw,
  Borrow,
  Repay,
  Liquidate,
}

////////////////////////
///// Schema Enums /////
////////////////////////

// The network names corresponding to the Network enum in the schema.
// They also correspond to the ones in `dataSource.network()` after converting to lower case.
export namespace Network {
  export const PERSISTENCE = "PERSISTENCE"; // Persistence mainnet
  export const TESTCORE = "TESTCORE"; // Persistence testnet
}

export namespace ProtocolType {
  export const EXCHANGE = "EXCHANGE";
  export const LENDING = "LENDING";
  export const YIELD = "YIELD";
  export const BRIDGE = "BRIDGE";
  export const GENERIC = "GENERIC";
}

export namespace LendingType {
  export const CDP = "CDP";
  export const POOLED = "POOLED";
}

export namespace RiskType {
  export const GLOBAL = "GLOBAL";
  export const ISOLATED = "ISOLATED";
}

export namespace RewardTokenType {
  export const DEPOSIT = "DEPOSIT";
  export const BORROW = "BORROW";
}

export namespace InterestRateType {
  export const STABLE = "STABLE";
  export const VARIABLE = "VARIABLE";
  export const FIXED = "FIXED";
}

export namespace InterestRateSide {
  export const LENDER = "LENDER";
  export const BORROWER = "BORROWER";
}

export namespace ActivityType {
  export const DAILY = "DAILY";
  export const HOURLY = "HOURLY";
}

export namespace SubgraphNetwork {
  export const PERSISTENCE = "core-1";
  export const TESTCORE = "test-core-1";
}

//////////////////////////////
/////   Chain Addresses  /////
//////////////////////////////

export const MARKET_ADDRESS = "persistence17p9rzwnnfxcjp32un9ug7yhhzgtkhvl9jfksztgw5uh69wac2pgsxzejz5";
export const PRICE_ORACLE1_ADDRESS =
  "persistence1wkwy0xh89ksdgj9hr347dyd2dw7zesmtrue6kfzyml4vdtz6e5wsmt95up";
export const LIQUIDATION_ADDRESS =
  "persistence1wkwy0xh89ksdgj9hr347dyd2dw7zesmtrue6kfzyml4vdtz6e5wsmt95up";
export const SAI_ADDRESS = "";
export const USDC_ADDRESS = "";
export const CUSDC_ADDRESS = "";
export const CETH_ADDRESS = "";
export const COMP_ADDRESS = "";
export const CCOMP_ADDRESS = "";
export const CUSDT_ADDRESS = "";
export const CTUSD_ADDRESS = "";

/////////////////////////////
///// Protocol Specific /////
/////////////////////////////

export const PROTOCOL_NAME = "Bamboo Loan";
export const PROTOCOL_SLUG = "bamboo-loan";
export const SUBGRAPH_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.0.0";
export const METHODOLOGY_VERSION = "1.0.0";
export const USDC_DECIMALS = 6;
export const XPRT_DECIMALS = 6;

////////////////////////
///// Type Helpers /////
////////////////////////

export const INT_NEGATIVE_ONE = -1 as i32;
export const INT_ZERO = 0 as i32;
export const INT_ONE = 1 as i32;
export const INT_TWO = 2 as i32;
export const INT_FOUR = 4 as i32;

export const BIGINT_ZERO = BigInt.fromI32(0);
export const BIGINT_ONE = BigInt.fromI32(1);
export const BIGINT_TEN_TO_SIXTH = BigInt.fromString("10").pow(6);
export const BIGINT_TEN_TO_EIGHTEENTH = BigInt.fromString("10").pow(18);

export const BIGDECIMAL_ZERO = new BigDecimal(BIGINT_ZERO);
export const BIGDECIMAL_ONE = new BigDecimal(BIGINT_ONE);
export const BIGDECIMAL_HUNDRED = new BigDecimal(BigInt.fromI32(100));

/////////////////////
///// Date/Time /////
/////////////////////

export const DAYS_PER_YEAR = 365;
export const SECONDS_PER_YEAR = 60 * 60 * 24 * DAYS_PER_YEAR;
export const SECONDS_PER_DAY = 60 * 60 * 24; // 86400
export const SECONDS_PER_HOUR = 60 * 60; // 3600

export const ETHEREUM_BLOCKS_PER_YEAR = SECONDS_PER_YEAR / 13; // 13 = seconds per block
export const AVALANCHE_BLOCKS_PER_YEAR = SECONDS_PER_DAY / 2; // 2 = seconds per block. This is NOT ideal since avalanche has variable block time.
export const FANTOM_BLOCKS_PER_YEAR = SECONDS_PER_DAY / 1; // 1 = seconds per block. This is NOT ideal since fantom has variable block time.
export const BSC_BLOCKS_PER_YEAR = SECONDS_PER_DAY / 3; // 3 = seconds per block
export const MATIC_BLOCKS_PER_YEAR = SECONDS_PER_DAY / 2; // 2 = seconds per block
export const ARBITRUM_BLOCKS_PER_YEAR = SECONDS_PER_DAY / 1; // 1 = seconds per block. This is NOT ideal since fantom has variable block time.

/////////////////////////////
/////        Math       /////
/////////////////////////////

export const mantissaFactor = 6;
export const pTokenDecimals = 6;
export const mantissaFactorBD = exponentToBigDecimal(mantissaFactor);
export const pTokenDecimalsBD = exponentToBigDecimal(pTokenDecimals);

// n => 10^n
export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let result = BIGINT_ONE;
  let ten = BigInt.fromI32(10);
  for (let i = 0; i < decimals; i++) {
    result = result.times(ten);
  }
  return result.toBigDecimal();
}