import { cosmos, log, BigInt, BigDecimal, Address, dataSource } from "@graphprotocol/graph-ts";
import { Account, ActiveAccount, FinancialsDailySnapshot, InterestRate, LendingProtocol, Market, MarketDailySnapshot, MarketHourlySnapshot, Token, UsageMetricsDailySnapshot, UsageMetricsHourlySnapshot, _CircularBuffer } from "../../generated/schema";
import { ActivityType, BIGDECIMAL_HUNDRED, BIGDECIMAL_ZERO, EventType, exponentToBigDecimal, INT_NEGATIVE_ONE, INT_ONE, INT_TWO, INT_ZERO, mantissaFactor, mantissaFactorBD, pTokenDecimals, SECONDS_PER_DAY, SECONDS_PER_HOUR, SubgraphNetwork } from "../constants";

export class UpdateMarketData {
  constructor(
    public readonly totalSupplyResult: BigInt,
    public readonly totalBorrowResult: BigInt,
    public readonly getUnderlyingPriceResult: BigInt,
    public readonly unitPerYear: i32
  ) {}
}

export function eventId(data: cosmos.EventData): string {
  return `${data.block.header.hash.toHexString()}-${data.block.header.height.toString()}-${data.event.eventType}`;
}

export function snapshotMarket(
  marketID: string,
  blockNumber: BigInt,
  blockTimestamp: BigInt
): void {
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[snapshotMarket] Market not found: {}", [marketID]);
    return;
  }

  //
  // daily snapshot
  //
  let dailySnapshot = getOrCreateMarketDailySnapshot(
    marketID,
    blockTimestamp.toI32()
  );
  dailySnapshot.protocol = market.protocol;
  dailySnapshot.market = marketID;
  dailySnapshot.totalValueLockedUSD = market.totalValueLockedUSD;
  dailySnapshot.cumulativeTotalRevenueUSD = market.cumulativeTotalRevenueUSD;
  dailySnapshot.cumulativeProtocolSideRevenueUSD =
    market.cumulativeProtocolSideRevenueUSD;
  dailySnapshot.cumulativeSupplySideRevenueUSD =
    market.cumulativeSupplySideRevenueUSD;
  dailySnapshot.totalDepositBalanceUSD = market.totalDepositBalanceUSD;
  dailySnapshot.cumulativeDepositUSD = market.cumulativeDepositUSD;
  dailySnapshot.totalBorrowBalanceUSD = market.totalBorrowBalanceUSD;
  dailySnapshot.cumulativeBorrowUSD = market.cumulativeBorrowUSD;
  dailySnapshot.cumulativeLiquidateUSD = market.cumulativeLiquidateUSD;
  dailySnapshot.inputTokenBalance = market.inputTokenBalance;
  dailySnapshot.inputTokenPriceUSD = market.inputTokenPriceUSD;
  dailySnapshot.outputTokenSupply = market.outputTokenSupply;
  dailySnapshot.outputTokenPriceUSD = market.outputTokenPriceUSD;
  dailySnapshot.exchangeRate = market.exchangeRate;
  dailySnapshot.rewardTokenEmissionsAmount = market.rewardTokenEmissionsAmount;
  dailySnapshot.rewardTokenEmissionsUSD = market.rewardTokenEmissionsUSD;
  dailySnapshot.blockNumber = blockNumber;
  dailySnapshot.timestamp = blockTimestamp;
  dailySnapshot.rates = getSnapshotRates(
    market.rates,
    (blockTimestamp.toI64() / SECONDS_PER_DAY).toString()
  );

  dailySnapshot.save();

  //
  // hourly snapshot
  //
  let hourlySnapshot = getOrCreateMarketHourlySnapshot(
    marketID,
    blockTimestamp.toI32()
  );
  hourlySnapshot.protocol = market.protocol;
  hourlySnapshot.market = marketID;
  hourlySnapshot.totalValueLockedUSD = market.totalValueLockedUSD;
  hourlySnapshot.cumulativeTotalRevenueUSD = market.cumulativeTotalRevenueUSD;
  hourlySnapshot.cumulativeProtocolSideRevenueUSD =
    market.cumulativeProtocolSideRevenueUSD;
  hourlySnapshot.cumulativeSupplySideRevenueUSD =
    market.cumulativeSupplySideRevenueUSD;
  hourlySnapshot.totalDepositBalanceUSD = market.totalDepositBalanceUSD;
  hourlySnapshot.cumulativeDepositUSD = market.cumulativeDepositUSD;
  hourlySnapshot.totalBorrowBalanceUSD = market.totalBorrowBalanceUSD;
  hourlySnapshot.cumulativeBorrowUSD = market.cumulativeBorrowUSD;
  hourlySnapshot.cumulativeLiquidateUSD = market.cumulativeLiquidateUSD;
  hourlySnapshot.inputTokenBalance = market.inputTokenBalance;
  hourlySnapshot.inputTokenPriceUSD = market.inputTokenPriceUSD;
  hourlySnapshot.outputTokenSupply = market.outputTokenSupply;
  hourlySnapshot.outputTokenPriceUSD = market.outputTokenPriceUSD;
  hourlySnapshot.exchangeRate = market.exchangeRate;
  hourlySnapshot.rewardTokenEmissionsAmount = market.rewardTokenEmissionsAmount;
  hourlySnapshot.rewardTokenEmissionsUSD = market.rewardTokenEmissionsUSD;
  hourlySnapshot.blockNumber = blockNumber;
  hourlySnapshot.timestamp = blockTimestamp;
  hourlySnapshot.rates = getSnapshotRates(
    market.rates,
    (blockTimestamp.toI64() / SECONDS_PER_HOUR).toString()
  );

  hourlySnapshot.save();
}

// create seperate InterestRate Entities for each market snapshot
// this is needed to prevent snapshot rates from being pointers to the current rate
function getSnapshotRates(rates: string[], timeSuffix: string): string[] {
  let snapshotRates: string[] = [];
  for (let i = 0; i < rates.length; i++) {
    let rate = InterestRate.load(rates[i]);
    if (!rate) {
      log.warning("[getSnapshotRates] rate {} not found, should not happen", [
        rates[i],
      ]);
      continue;
    }

    // create new snapshot rate
    let snapshotRateId = rates[i].concat("-").concat(timeSuffix);
    let snapshotRate = new InterestRate(snapshotRateId);
    snapshotRate.side = rate.side;
    snapshotRate.type = rate.type;
    snapshotRate.rate = rate.rate;
    snapshotRate.save();
    snapshotRates.push(snapshotRateId);
  }
  return snapshotRates;
}

/**
 * Snapshot usage.
 * It has to happen in handleMint, handleRedeem, handleBorrow, handleRepayBorrow and handleLiquidate,
 * because handleAccrueInterest doesn't have access to the accountID
 * @param blockNumber
 * @param blockTimestamp
 * @param accountID
 */
export function snapshotUsage(
  MARKET_ADDRESS: string,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  accountID: string,
  eventType: EventType
): void {
  let protocol = LendingProtocol.load(MARKET_ADDRESS);
  if (!protocol) {
    log.error("[snapshotUsage] Protocol not found, this SHOULD NOT happen", []);
    return;
  }
  let account = Account.load(accountID);
  if (!account) {
    account = new Account(accountID);
    account.save();

    protocol.cumulativeUniqueUsers += 1;
    protocol.save();
  }

  //
  // daily snapshot
  //
  let dailySnapshotID = (blockTimestamp.toI32() / SECONDS_PER_DAY).toString();
  let dailySnapshot = UsageMetricsDailySnapshot.load(dailySnapshotID);
  if (!dailySnapshot) {
    dailySnapshot = new UsageMetricsDailySnapshot(dailySnapshotID);
    dailySnapshot.protocol = protocol.id;
    dailySnapshot.dailyActiveUsers = INT_ZERO;
    dailySnapshot.cumulativeUniqueUsers = INT_ZERO;
    dailySnapshot.dailyTransactionCount = INT_ZERO;
    dailySnapshot.dailyDepositCount = INT_ZERO;
    dailySnapshot.dailyWithdrawCount = INT_ZERO;
    dailySnapshot.dailyBorrowCount = INT_ZERO;
    dailySnapshot.dailyRepayCount = INT_ZERO;
    dailySnapshot.dailyLiquidateCount = INT_ZERO;
    dailySnapshot.blockNumber = blockNumber;
    dailySnapshot.timestamp = blockTimestamp;
  }
  let dailyAccountID = ActivityType.DAILY.concat("-")
    .concat(accountID)
    .concat("-")
    .concat(dailySnapshotID);
  let dailyActiveAccount = ActiveAccount.load(dailyAccountID);
  if (!dailyActiveAccount) {
    dailyActiveAccount = new ActiveAccount(dailyAccountID);
    dailyActiveAccount.save();

    dailySnapshot.dailyActiveUsers += 1;
  }
  dailySnapshot.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  dailySnapshot.dailyTransactionCount += 1;
  switch (eventType) {
    case EventType.Deposit:
      dailySnapshot.dailyDepositCount += 1;
      break;
    case EventType.Withdraw:
      dailySnapshot.dailyWithdrawCount += 1;
      break;
    case EventType.Borrow:
      dailySnapshot.dailyBorrowCount += 1;
      break;
    case EventType.Repay:
      dailySnapshot.dailyRepayCount += 1;
      break;
    case EventType.Liquidate:
      dailySnapshot.dailyLiquidateCount += 1;
      break;
    default:
      break;
  }
  dailySnapshot.totalPoolCount = protocol.totalPoolCount;
  dailySnapshot.blockNumber = blockNumber;
  dailySnapshot.timestamp = blockTimestamp;
  dailySnapshot.save();

  //
  // hourly snapshot
  //
  let hourlySnapshotID = (blockTimestamp.toI32() / SECONDS_PER_HOUR).toString();
  let hourlySnapshot = UsageMetricsHourlySnapshot.load(hourlySnapshotID);
  if (!hourlySnapshot) {
    hourlySnapshot = new UsageMetricsHourlySnapshot(hourlySnapshotID);
    hourlySnapshot.protocol = protocol.id;
    hourlySnapshot.hourlyActiveUsers = INT_ZERO;
    hourlySnapshot.cumulativeUniqueUsers = INT_ZERO;
    hourlySnapshot.hourlyTransactionCount = INT_ZERO;
    hourlySnapshot.hourlyDepositCount = INT_ZERO;
    hourlySnapshot.hourlyWithdrawCount = INT_ZERO;
    hourlySnapshot.hourlyBorrowCount = INT_ZERO;
    hourlySnapshot.hourlyRepayCount = INT_ZERO;
    hourlySnapshot.hourlyLiquidateCount = INT_ZERO;
    hourlySnapshot.blockNumber = blockNumber;
    hourlySnapshot.timestamp = blockTimestamp;
  }
  let hourlyAccountID = ActivityType.HOURLY.concat("-")
    .concat(accountID)
    .concat("-")
    .concat(hourlySnapshotID);
  let hourlyActiveAccount = ActiveAccount.load(hourlyAccountID);
  if (!hourlyActiveAccount) {
    hourlyActiveAccount = new ActiveAccount(hourlyAccountID);
    hourlyActiveAccount.save();

    hourlySnapshot.hourlyActiveUsers += 1;
  }
  hourlySnapshot.cumulativeUniqueUsers = protocol.cumulativeUniqueUsers;
  hourlySnapshot.hourlyTransactionCount += 1;
  switch (eventType) {
    case EventType.Deposit:
      hourlySnapshot.hourlyDepositCount += 1;
      break;
    case EventType.Withdraw:
      hourlySnapshot.hourlyWithdrawCount += 1;
      break;
    case EventType.Borrow:
      hourlySnapshot.hourlyBorrowCount += 1;
      break;
    case EventType.Repay:
      hourlySnapshot.hourlyRepayCount += 1;
      break;
    case EventType.Liquidate:
      hourlySnapshot.hourlyLiquidateCount += 1;
      break;
    default:
      break;
  }
  hourlySnapshot.blockNumber = blockNumber;
  hourlySnapshot.timestamp = blockTimestamp;
  hourlySnapshot.save();
}

export function updateMarketSnapshots(
  marketID: string,
  timestamp: i64,
  amountUSD: BigDecimal,
  eventType: EventType
): void {
  let marketHourlySnapshot = getOrCreateMarketHourlySnapshot(
    marketID,
    timestamp
  );
  switch (eventType) {
    case EventType.Deposit:
      marketHourlySnapshot.hourlyDepositUSD =
        marketHourlySnapshot.hourlyDepositUSD.plus(amountUSD);
      break;
    case EventType.Borrow:
      marketHourlySnapshot.hourlyBorrowUSD =
        marketHourlySnapshot.hourlyBorrowUSD.plus(amountUSD);
      break;
    case EventType.Liquidate:
      marketHourlySnapshot.hourlyLiquidateUSD =
        marketHourlySnapshot.hourlyLiquidateUSD.plus(amountUSD);
      break;
    case EventType.Withdraw:
      marketHourlySnapshot.hourlyWithdrawUSD =
        marketHourlySnapshot.hourlyWithdrawUSD.plus(amountUSD);
      break;
    case EventType.Repay:
      marketHourlySnapshot.hourlyRepayUSD =
        marketHourlySnapshot.hourlyRepayUSD.plus(amountUSD);
      break;
    default:
      break;
  }
  marketHourlySnapshot.save();

  let marketDailySnapshot = getOrCreateMarketDailySnapshot(marketID, timestamp);
  switch (eventType) {
    case EventType.Deposit:
      marketDailySnapshot.dailyDepositUSD =
        marketDailySnapshot.dailyDepositUSD.plus(amountUSD);
      break;
    case EventType.Borrow:
      marketDailySnapshot.dailyBorrowUSD =
        marketDailySnapshot.dailyBorrowUSD.plus(amountUSD);
      break;
    case EventType.Liquidate:
      marketDailySnapshot.dailyLiquidateUSD =
        marketDailySnapshot.dailyLiquidateUSD.plus(amountUSD);
      break;
    case EventType.Withdraw:
      marketDailySnapshot.dailyWithdrawUSD =
        marketDailySnapshot.dailyWithdrawUSD.plus(amountUSD);
      break;
    case EventType.Repay:
      marketDailySnapshot.dailyRepayUSD =
        marketDailySnapshot.dailyRepayUSD.plus(amountUSD);
      break;
    default:
      break;
  }
  marketDailySnapshot.save();
}

export function getOrCreateMarketHourlySnapshot(
  marketID: string,
  blockTimestamp: i64
): MarketHourlySnapshot {
  let snapshotID = getMarketHourlySnapshotID(marketID, blockTimestamp);
  let snapshot = MarketHourlySnapshot.load(snapshotID);
  if (!snapshot) {
    snapshot = new MarketHourlySnapshot(snapshotID);

    // initialize zero values to ensure no null runtime errors
    snapshot.hourlyDepositUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyBorrowUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyLiquidateUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyWithdrawUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyRepayUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyTotalRevenueUSD = BIGDECIMAL_ZERO;
    snapshot.hourlyProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
    snapshot.hourlySupplySideRevenueUSD = BIGDECIMAL_ZERO;
  }

  return snapshot;
}

export function getOrCreateMarketDailySnapshot(
  marketID: string,
  blockTimestamp: i64
): MarketDailySnapshot {
  let snapshotID = getMarketDailySnapshotID(marketID, blockTimestamp);
  let snapshot = MarketDailySnapshot.load(snapshotID);
  if (!snapshot) {
    snapshot = new MarketDailySnapshot(snapshotID);

    let market = Market.load(marketID);

    // initialize zero values to ensure no null runtime errors
    snapshot.protocol = market!.protocol;
    snapshot.dailyDepositUSD = BIGDECIMAL_ZERO;
    snapshot.dailyBorrowUSD = BIGDECIMAL_ZERO;
    snapshot.dailyLiquidateUSD = BIGDECIMAL_ZERO;
    snapshot.dailyWithdrawUSD = BIGDECIMAL_ZERO;
    snapshot.dailyRepayUSD = BIGDECIMAL_ZERO;
    snapshot.dailyTotalRevenueUSD = BIGDECIMAL_ZERO;
    snapshot.dailySupplySideRevenueUSD = BIGDECIMAL_ZERO;
    snapshot.dailyProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
  }

  return snapshot;
}

function getMarketHourlySnapshotID(marketID: string, timestamp: i64): string {
  return marketID.concat("-").concat((timestamp / SECONDS_PER_HOUR).toString());
}

function getMarketDailySnapshotID(marketID: string, timestamp: i64): string {
  return marketID.concat("-").concat((timestamp / SECONDS_PER_DAY).toString());
}

/**
 *
 * @param blockNumber
 * @param blockTimestamp
 * @returns
 */
export function snapshotFinancials(
  marketAddr: string,
  blockNumber: BigInt,
  blockTimestamp: BigInt
): void {
  let protocol = LendingProtocol.load(marketAddr);
  if (!protocol) {
    log.error(
      "[snapshotFinancials] Protocol not found, this SHOULD NOT happen",
      []
    );
    return;
  }
  let snapshotID = (blockTimestamp.toI32() / SECONDS_PER_DAY).toString();
  let snapshot = new FinancialsDailySnapshot(snapshotID);

  snapshot.protocol = protocol.id;
  snapshot.totalValueLockedUSD = protocol.totalValueLockedUSD;
  snapshot.totalDepositBalanceUSD = protocol.totalDepositBalanceUSD;
  snapshot.totalBorrowBalanceUSD = protocol.totalBorrowBalanceUSD;
  snapshot.cumulativeDepositUSD = protocol.cumulativeDepositUSD;
  snapshot.cumulativeBorrowUSD = protocol.cumulativeBorrowUSD;
  snapshot.cumulativeLiquidateUSD = protocol.cumulativeLiquidateUSD;
  snapshot.cumulativeTotalRevenueUSD = protocol.cumulativeTotalRevenueUSD;
  snapshot.cumulativeProtocolSideRevenueUSD =
    protocol.cumulativeProtocolSideRevenueUSD;
  snapshot.cumulativeSupplySideRevenueUSD =
    protocol.cumulativeSupplySideRevenueUSD;

  let dailyDepositUSD = BIGDECIMAL_ZERO;
  let dailyBorrowUSD = BIGDECIMAL_ZERO;
  let dailyLiquidateUSD = BIGDECIMAL_ZERO;
  let dailyWithdrawUSD = BIGDECIMAL_ZERO;
  let dailyRepayUSD = BIGDECIMAL_ZERO;
  let dailyTotalRevenueUSD = BIGDECIMAL_ZERO;
  let dailyProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
  let dailySupplySideRevenueUSD = BIGDECIMAL_ZERO;

  for (let i = 0; i < protocol._marketIDs.length; i++) {
    let market = Market.load(protocol._marketIDs[i]);
    if (!market) {
      log.warning("[snapshotFinancials] Market not found: {}", [
        protocol._marketIDs[i],
      ]);
      // best effort
      continue;
    }

    let marketDailySnapshotID = getMarketDailySnapshotID(
      market.id,
      blockTimestamp.toI32()
    );
    let marketDailySnapshot = MarketDailySnapshot.load(marketDailySnapshotID);
    if (!marketDailySnapshot) {
      // this is okay - no MarketDailySnapshot means no transactions in that market during that day
      log.info(
        "[snapshotFinancials] MarketDailySnapshot not found (ie, no transactions in that market during this day): {}",
        [marketDailySnapshotID]
      );
      continue;
    }
    dailyDepositUSD = dailyDepositUSD.plus(marketDailySnapshot.dailyDepositUSD);
    dailyBorrowUSD = dailyBorrowUSD.plus(marketDailySnapshot.dailyBorrowUSD);
    dailyLiquidateUSD = dailyLiquidateUSD.plus(
      marketDailySnapshot.dailyLiquidateUSD
    );
    dailyWithdrawUSD = dailyWithdrawUSD.plus(
      marketDailySnapshot.dailyWithdrawUSD
    );
    dailyRepayUSD = dailyRepayUSD.plus(marketDailySnapshot.dailyRepayUSD);
    dailyTotalRevenueUSD = dailyTotalRevenueUSD.plus(
      marketDailySnapshot.dailyTotalRevenueUSD
    );
    dailyProtocolSideRevenueUSD = dailyProtocolSideRevenueUSD.plus(
      marketDailySnapshot.dailyProtocolSideRevenueUSD
    );
    dailySupplySideRevenueUSD = dailySupplySideRevenueUSD.plus(
      marketDailySnapshot.dailySupplySideRevenueUSD
    );
  }

  snapshot.dailyDepositUSD = dailyDepositUSD;
  snapshot.dailyBorrowUSD = dailyBorrowUSD;
  snapshot.dailyLiquidateUSD = dailyLiquidateUSD;
  snapshot.dailyWithdrawUSD = dailyWithdrawUSD;
  snapshot.dailyRepayUSD = dailyRepayUSD;
  snapshot.dailyTotalRevenueUSD = dailyTotalRevenueUSD;
  snapshot.dailyProtocolSideRevenueUSD = dailyProtocolSideRevenueUSD;
  snapshot.dailySupplySideRevenueUSD = dailySupplySideRevenueUSD;
  snapshot.blockNumber = blockNumber;
  snapshot.timestamp = blockTimestamp;
  snapshot.save();
}

export function updateProtocol(marketAddr: string): void {
  let protocol = LendingProtocol.load(marketAddr);
  if (!protocol) {
    log.error(
      "[updateProtocol] Protocol not found, this SHOULD NOT happen",
      []
    );
    return;
  }

  let totalValueLockedUSD = BIGDECIMAL_ZERO;
  let totalDepositBalanceUSD = BIGDECIMAL_ZERO;
  let totalBorrowBalanceUSD = BIGDECIMAL_ZERO;
  let cumulativeBorrowUSD = BIGDECIMAL_ZERO;
  let cumulativeDepositUSD = BIGDECIMAL_ZERO;
  let cumulativeLiquidateUSD = BIGDECIMAL_ZERO;
  let cumulativeTotalRevenueUSD = BIGDECIMAL_ZERO;
  let cumulativeProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
  let cumulativeSupplySideRevenueUSD = BIGDECIMAL_ZERO;

  for (let i = 0; i < protocol._marketIDs.length; i++) {
    let market = Market.load(protocol._marketIDs[i]);
    if (!market) {
      log.warning("[updateProtocol] Market not found: {}", [
        protocol._marketIDs[i],
      ]);
      // best effort
      continue;
    }
    totalValueLockedUSD = totalValueLockedUSD.plus(market.totalValueLockedUSD);
    totalDepositBalanceUSD = totalDepositBalanceUSD.plus(
      market.totalDepositBalanceUSD
    );
    totalBorrowBalanceUSD = totalBorrowBalanceUSD.plus(
      market.totalBorrowBalanceUSD
    );
    cumulativeBorrowUSD = cumulativeBorrowUSD.plus(market.cumulativeBorrowUSD);
    cumulativeDepositUSD = cumulativeDepositUSD.plus(
      market.cumulativeDepositUSD
    );
    cumulativeLiquidateUSD = cumulativeLiquidateUSD.plus(
      market.cumulativeLiquidateUSD
    );
    cumulativeTotalRevenueUSD = cumulativeTotalRevenueUSD.plus(
      market.cumulativeTotalRevenueUSD
    );
    cumulativeProtocolSideRevenueUSD = cumulativeProtocolSideRevenueUSD.plus(
      market.cumulativeProtocolSideRevenueUSD
    );
    cumulativeSupplySideRevenueUSD = cumulativeSupplySideRevenueUSD.plus(
      market.cumulativeSupplySideRevenueUSD
    );
  }

  protocol.totalValueLockedUSD = totalValueLockedUSD;
  protocol.totalDepositBalanceUSD = totalDepositBalanceUSD;
  protocol.totalBorrowBalanceUSD = totalBorrowBalanceUSD;
  protocol.cumulativeBorrowUSD = cumulativeBorrowUSD;
  protocol.cumulativeDepositUSD = cumulativeDepositUSD;
  protocol.cumulativeLiquidateUSD = cumulativeLiquidateUSD;
  protocol.cumulativeTotalRevenueUSD = cumulativeTotalRevenueUSD;
  protocol.cumulativeProtocolSideRevenueUSD = cumulativeProtocolSideRevenueUSD;
  protocol.cumulativeSupplySideRevenueUSD = cumulativeSupplySideRevenueUSD;
  protocol.save();
}

// updateMarketPrices: true when every market price is updated on AccrueInterest()
export function updateMarket(
  marketID: string,
  event: cosmos.Event,
  blockNumber: BigInt,
  blockTimestamp: BigInt,
  updateMarketPrices: boolean,
  marketAddr: string,
  unitPerYear: i32
): void {
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[updateMarket] Market not found: {}", [marketID]);
    return;
  }

  let underlyingToken = Token.load(market.inputToken);
  if (!underlyingToken) {
    log.warning("[updateMarket] Underlying token not found: {}", [
      market.inputToken,
    ]);
    return;
  }

  let supplyExchangeRate = BigDecimal.fromString(event.getAttributeValue("liquidity_index"));
  let borrowExchangeRate = BigDecimal.fromString(event.getAttributeValue("borrow_index"));
  let supplyRateResult = BigDecimal.fromString(event.getAttributeValue("liquidity_rate"));
  let borrowRateResult = BigDecimal.fromString(event.getAttributeValue("borrow_rate"));

  if (updateMarketPrices) {
    updateAllMarketPrices(marketAddr, blockNumber);
  }

  underlyingToken.lastPriceUSD = market.inputTokenPriceUSD;
  underlyingToken.lastPriceBlockNumber = blockNumber;
  underlyingToken.save();

  // TODO: check
  market.outputTokenSupply = supplyExchangeRate
    .times(market.inputTokenBalance.toBigDecimal())
    .truncate(0)
    .digits;

  // get correct outputTokenDecimals for generic exchangeRate calculation
  let outputTokenDecimals = pTokenDecimals;
  if (market.outputToken) {
    let outputToken = Token.load(market.outputToken!);
    if (!outputToken) {
      log.warning("[updateMarket] Output token not found: {}", [
        market.outputToken!,
      ]);
    } else {
      outputTokenDecimals = outputToken.decimals;
    }
  }

  

  market.outputTokenPriceUSD = supplyExchangeRate.times(
    market.inputTokenPriceUSD
  );

  // calculate inputTokenBalance only if exchangeRate is updated properly
  // mantissaFactor = (inputTokenDecimals - outputTokenDecimals)  (Note: can be negative)
  // inputTokenBalance = (outputSupply * exchangeRate) * (10 ^ mantissaFactor)
  if (underlyingToken.decimals > outputTokenDecimals) {
    // we want to multiply out the difference to expand BD
    let mantissaFactorBD = exponentToBigDecimal(
      underlyingToken.decimals - outputTokenDecimals
    );
    let inputTokenBalanceBD = market.outputTokenSupply
      .toBigDecimal()
      .times(market.exchangeRate!)
      .times(mantissaFactorBD)
      .truncate(0);
    market.inputTokenBalance = BigInt.fromString(
      inputTokenBalanceBD.toString()
    );
  } else {
    // we want to divide back the difference to decrease the BD
    let mantissaFactorBD = exponentToBigDecimal(
      outputTokenDecimals - underlyingToken.decimals
    );
    let inputTokenBalanceBD = market.outputTokenSupply
      .toBigDecimal()
      .times(market.exchangeRate!)
      .div(mantissaFactorBD)
      .truncate(0);
    market.inputTokenBalance = BigInt.fromString(
      inputTokenBalanceBD.toString()
    );
  }

  let underlyingSupplyUSD = market.inputTokenBalance
    .toBigDecimal()
    .div(exponentToBigDecimal(underlyingToken.decimals))
    .times(market.inputTokenPriceUSD);
  market.totalValueLockedUSD = underlyingSupplyUSD;
  market.totalDepositBalanceUSD = underlyingSupplyUSD;

  market.totalBorrowBalanceUSD = market._borrowBalance
    .toBigDecimal()
    .div(exponentToBigDecimal(underlyingToken.decimals))
    .times(market.inputTokenPriceUSD);

  
  setSupplyInterestRate(
    marketID,
    convertRatePerUnitToAPY(
      supplyRateResult,
      unitPerYear
    )
  );

  setBorrowInterestRate(
    marketID,
    convertRatePerUnitToAPY(
      borrowRateResult,
      unitPerYear
    )
  );

  let interestAccumulatedUSD = supplyRateResult
    .div(exponentToBigDecimal(underlyingToken.decimals))
    .times(market.inputTokenPriceUSD);
  let protocolSideRevenueUSDDelta = interestAccumulatedUSD.times(
    market._reserveFactor
  );
  let supplySideRevenueUSDDelta = interestAccumulatedUSD.minus(
    protocolSideRevenueUSDDelta
  );

  market.cumulativeTotalRevenueUSD = market.cumulativeTotalRevenueUSD.plus(
    interestAccumulatedUSD
  );
  market.cumulativeProtocolSideRevenueUSD =
    market.cumulativeProtocolSideRevenueUSD.plus(protocolSideRevenueUSDDelta);
  market.cumulativeSupplySideRevenueUSD =
    market.cumulativeSupplySideRevenueUSD.plus(supplySideRevenueUSDDelta);
  market.save();

  // update daily fields in marketDailySnapshot
  let dailySnapshot = getOrCreateMarketDailySnapshot(
    market.id,
    blockTimestamp.toI32()
  );
  dailySnapshot.dailyTotalRevenueUSD = dailySnapshot.dailyTotalRevenueUSD.plus(
    interestAccumulatedUSD
  );
  dailySnapshot.dailyProtocolSideRevenueUSD =
    dailySnapshot.dailyProtocolSideRevenueUSD.plus(protocolSideRevenueUSDDelta);
  dailySnapshot.dailySupplySideRevenueUSD =
    dailySnapshot.dailySupplySideRevenueUSD.plus(supplySideRevenueUSDDelta);
  dailySnapshot.save();

  // update hourly fields in marketHourlySnapshot
  let hourlySnapshot = getOrCreateMarketHourlySnapshot(
    market.id,
    blockTimestamp.toI32()
  );
  hourlySnapshot.hourlyTotalRevenueUSD =
    hourlySnapshot.hourlyTotalRevenueUSD.plus(interestAccumulatedUSD);
  hourlySnapshot.hourlyProtocolSideRevenueUSD =
    hourlySnapshot.hourlyProtocolSideRevenueUSD.plus(
      protocolSideRevenueUSDDelta
    );
  hourlySnapshot.hourlySupplySideRevenueUSD =
    hourlySnapshot.hourlySupplySideRevenueUSD.plus(supplySideRevenueUSDDelta);
  hourlySnapshot.save();
}

export function updateAllMarketPrices(
  marketAddr: string,
  blockNumber: BigInt
): void {
  let protocol = LendingProtocol.load(marketAddr);
  if (!protocol) {
    log.warning("[updateAllMarketPrices] protocol not found: {}", [
      marketAddr,
    ]);
    return;
  }
  let priceOracle = protocol._priceOracle;

  for (let i = 0; i < protocol._marketIDs.length; i++) {
    let market = Market.load(protocol._marketIDs[i]);
    if (!market) {
      break;
    }
    let underlyingToken = Token.load(market.inputToken);
    if (!underlyingToken) {
      break;
    }

    let underlyingTokenPriceUSD = market.inputTokenPriceUSD;

    underlyingToken.lastPriceUSD = underlyingTokenPriceUSD;
    underlyingToken.lastPriceBlockNumber = blockNumber;
    underlyingToken.save();

    market.inputTokenPriceUSD = underlyingTokenPriceUSD;

    // update TVL, supplyUSD, borrowUSD
    market.totalDepositBalanceUSD = market.inputTokenBalance
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
      .times(underlyingTokenPriceUSD);
    market.totalBorrowBalanceUSD = market._borrowBalance
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
      .times(underlyingTokenPriceUSD);
    market.totalValueLockedUSD = market.inputTokenBalance
      .toBigDecimal()
      .div(exponentToBigDecimal(underlyingToken.decimals))
      .times(underlyingTokenPriceUSD);
    market.save();
  }
}

export function convertRatePerUnitToAPY(
  ratePerUnit: BigDecimal,
  unitPerYear: i32
): BigDecimal {
  return BigInt.fromI32(unitPerYear)
    .toBigDecimal()
    .times(ratePerUnit)
    .times(BIGDECIMAL_HUNDRED);
}

export function setSupplyInterestRate(
  marketID: string,
  rate: BigDecimal
): void {
  setInterestRate(marketID, rate, true);
}

export function setBorrowInterestRate(
  marketID: string,
  rate: BigDecimal
): void {
  setInterestRate(marketID, rate, false);
}

function setInterestRate(
  marketID: string,
  rate: BigDecimal,
  isSupply: boolean
): void {
  let market = Market.load(marketID);
  if (!market) {
    log.warning("[setInterestRate] Market not found: {}", [marketID]);
    return;
  }
  if (market.rates.length < 2) {
    log.warning("[setInterestRate] Market has less than 2 rates: {}", [
      marketID,
    ]);
    return;
  }
  let supplyInterestRateID = market.rates[0];
  let borrowInterestRateID = market.rates[1];
  let supplyInterestRate = InterestRate.load(supplyInterestRateID);
  if (!supplyInterestRate) {
    log.warning("[setInterestRate] Supply interest rate not found: {}", [
      supplyInterestRateID,
    ]);
    return;
  }
  let borrowInterestRate = InterestRate.load(borrowInterestRateID);
  if (!borrowInterestRate) {
    log.warning("[setInterestRate] Borrow interest rate not found: {}", [
      borrowInterestRateID,
    ]);
    return;
  }
  if (isSupply) {
    supplyInterestRate.rate = rate;
    supplyInterestRate.save();
  } else {
    borrowInterestRate.rate = rate;
    borrowInterestRate.save();
  }
  market.rates = [supplyInterestRateID, borrowInterestRateID];
  market.save();
}


export const RATE_IN_SECONDS = 86400;
export const RATE_IN_SECONDS_BD = BigDecimal.fromString(
  RATE_IN_SECONDS.toString()
);
export const CIRCULAR_BUFFER = "CIRCULAR_BUFFER";
export const BUFFER_SIZE = 144;
export const STARTING_BLOCKS_PER_DAY = RATE_IN_SECONDS_BD.div(
  getStartingBlockRate()
);

export function getOrCreateCircularBuffer(): _CircularBuffer {
  let circularBuffer = _CircularBuffer.load(CIRCULAR_BUFFER);

  if (!circularBuffer) {
    circularBuffer = new _CircularBuffer(CIRCULAR_BUFFER);

    let blocks = new Array<i32>(BUFFER_SIZE);
    for (let i = INT_ZERO; i < BUFFER_SIZE; i += INT_TWO) {
      blocks[i] = INT_NEGATIVE_ONE;
      blocks[i + INT_ONE] = INT_NEGATIVE_ONE;
    }

    circularBuffer.blocks = blocks;
    circularBuffer.windowStartIndex = INT_ZERO;
    circularBuffer.nextIndex = INT_ZERO;
    circularBuffer.bufferSize = BUFFER_SIZE;
    circularBuffer.blocksPerDay = STARTING_BLOCKS_PER_DAY;

    circularBuffer.save();
  }

  return circularBuffer;
}

function getStartingBlockRate(): BigDecimal {
  // Block rates pulled from google searches - rough estimates

  let network = dataSource.network();
  if (network == SubgraphNetwork.PERSISTENCE) {
    return BigDecimal.fromString("5.9");
  } else if (network == SubgraphNetwork.TESTCORE) {
    return BigDecimal.fromString("5.7");
  }
  // Blocks are mined as needed
  // else if (network == SubgraphNetwork.AVALANCHE) return BigDecimal.fromString("2.5")
  // else if (dataSource.network() == "cronos") return BigDecimal.fromString("13.39")
  // else if (dataSource.network() == "harmony") return BigDecimal.fromString("13.39")
  // else if (dataSource.network() == SubgraphNetwork.MOONBEAM) return BigDecimal.fromString("13.39")
  // else if (dataSource.network() == SubgraphNetwork.MOONRIVER) return BigDecimal.fromString("13.39")
  else {
    log.warning("getStartingBlockRate(): Network not found", []);
    return BIGDECIMAL_ZERO;
  }
}