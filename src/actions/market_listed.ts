import { cosmos, BigInt } from "@graphprotocol/graph-ts";
import { snapshotFinancials, snapshotMarket } from ".";
import { Token, Market, LendingProtocol, InterestRate } from "../../generated/schema";
import { BIGDECIMAL_ZERO, BIGINT_ZERO, InterestRateSide, InterestRateType, INT_ZERO, LendingType, LIQUIDATION_ADDRESS, MARKET_ADDRESS, METHODOLOGY_VERSION, Network, PRICE_ORACLE1_ADDRESS, ProtocolType, PROTOCOL_NAME, PROTOCOL_SLUG, pTokenDecimals, RiskType, SCHEMA_VERSION, SUBGRAPH_VERSION } from "../constants";

export class ProtocolData {
    constructor(
        public readonly marketAddr: string,
        public readonly name: string,
        public readonly slug: string,
        public readonly schemaVersion: string,
        public readonly subgraphVersion: string,
        public readonly methodologyVersion: string,
        public readonly network: string,
        public readonly liquidationAddr: string,
        public readonly oracleAddr: string
    ) {}
}

export class TokenData {
    constructor(
        public readonly address: string,
        public readonly name: string,
        public readonly symbol: string,
        public readonly decimals: i32
    ) {}
}

export function _handleMarketListed(protocol: LendingProtocol, data: cosmos.EventData): void {
    let event = data.event;

    let pTokenAddr = event.getAttributeValue("asset");
    let pToken = Token.load(pTokenAddr);
    if (pToken != null) {
        return;
    }
    // this is a new pToken, a new underlying token, and a new market

    //
    // create pToken
    //
    pToken = new Token(pTokenAddr);
    pToken.name = event.getAttributeValue("asset");
    pToken.symbol = event.getAttributeValue("asset");
    pToken.decimals = pTokenDecimals;
    pToken.save();

    //
    // create underlying token
    //
    let underlyingToken = new Token(event.getAttributeValue("asset"));
    underlyingToken.name = event.getAttributeValue("asset");
    underlyingToken.symbol = event.getAttributeValue("asset");
    underlyingToken.decimals = pTokenDecimals;
    underlyingToken.save();

    //
    // create market
    //
    let market = new Market(pTokenAddr);
    market.name = pToken.name;
    market.protocol = protocol.id;
    market.inputToken = underlyingToken.id;
    market.outputToken = pToken.id;

    let supplyInterestRate = new InterestRate(
        InterestRateSide.LENDER.concat("-")
        .concat(InterestRateType.VARIABLE)
        .concat("-")
        .concat(market.id)
    );
    supplyInterestRate.side = InterestRateSide.LENDER;
    supplyInterestRate.type = InterestRateType.VARIABLE;
    supplyInterestRate.rate = BIGDECIMAL_ZERO;
    supplyInterestRate.save();
    let borrowInterestRate = new InterestRate(
        InterestRateSide.BORROWER.concat("-")
        .concat(InterestRateType.VARIABLE)
        .concat("-")
        .concat(market.id)
    );
    borrowInterestRate.side = InterestRateSide.BORROWER;
    borrowInterestRate.type = InterestRateType.VARIABLE;
    borrowInterestRate.rate = BIGDECIMAL_ZERO;
    borrowInterestRate.save();
    market.rates = [supplyInterestRate.id, borrowInterestRate.id];

    market.isActive = true;
    market.canUseAsCollateral = true;
    market.canBorrowFrom = true;
    // TODO: set these params
    market.liquidationPenalty = BIGDECIMAL_ZERO;
    market._reserveFactor = BIGDECIMAL_ZERO;

    market.createdTimestamp = BigInt.fromString(data.block.header.time.seconds.toString());
    market.createdBlockNumber = BigInt.fromU64(data.block.header.height);

    // add zero fields
    market.maximumLTV = BIGDECIMAL_ZERO;
    market.liquidationThreshold = BIGDECIMAL_ZERO;
    market.totalValueLockedUSD = BIGDECIMAL_ZERO;
    market.totalDepositBalanceUSD = BIGDECIMAL_ZERO;
    market.cumulativeDepositUSD = BIGDECIMAL_ZERO;
    market.totalBorrowBalanceUSD = BIGDECIMAL_ZERO;
    market.cumulativeBorrowUSD = BIGDECIMAL_ZERO;
    market.cumulativeLiquidateUSD = BIGDECIMAL_ZERO;
    market.inputTokenBalance = BIGINT_ZERO;
    market.inputTokenPriceUSD = BIGDECIMAL_ZERO;
    market.outputTokenSupply = BIGINT_ZERO;
    market.outputTokenPriceUSD = BIGDECIMAL_ZERO;
    market.exchangeRate = BIGDECIMAL_ZERO;
    market.cumulativeSupplySideRevenueUSD = BIGDECIMAL_ZERO;
    market.cumulativeProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
    market.cumulativeTotalRevenueUSD = BIGDECIMAL_ZERO;
    market._borrowBalance = BIGINT_ZERO;

    market.save();

    //
    // update protocol
    //
    let marketIDs = protocol._marketIDs;
    marketIDs.push(market.id);
    protocol._marketIDs = marketIDs;
    protocol.totalPoolCount++;
    protocol.save();
}

export function _getOrCreateProtocol(
    protocolData: ProtocolData
): LendingProtocol {
    let protocol = LendingProtocol.load(
        protocolData.marketAddr
    );
    if (!protocol) {
        protocol = new LendingProtocol(protocolData.marketAddr);
        protocol.name = protocolData.name;
        protocol.slug = protocolData.slug;
        protocol.schemaVersion = protocolData.schemaVersion;
        protocol.subgraphVersion = protocolData.subgraphVersion;
        protocol.methodologyVersion = protocolData.methodologyVersion;
        protocol.network = protocolData.network;
        protocol.type = ProtocolType.LENDING;
        protocol.lendingType = LendingType.POOLED;
        protocol.riskType = RiskType.GLOBAL;

        // Set quantitative data params
        protocol.cumulativeUniqueUsers = 0;
        protocol.totalValueLockedUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeSupplySideRevenueUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeProtocolSideRevenueUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeTotalRevenueUSD = BIGDECIMAL_ZERO;
        protocol.totalDepositBalanceUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeDepositUSD = BIGDECIMAL_ZERO;
        protocol.totalBorrowBalanceUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeBorrowUSD = BIGDECIMAL_ZERO;
        protocol.cumulativeLiquidateUSD = BIGDECIMAL_ZERO;
        protocol.totalPoolCount = INT_ZERO;
        protocol._marketIDs = [];
        // set liquidation incentive
        protocol._liquidationIncentive = BIGDECIMAL_ZERO
        protocol._priceOracle = protocolData.oracleAddr;
        protocol.save();
    }
    return protocol;
}

/////////////////
//// Helpers ////
/////////////////

export function getOrCreateProtocol(): LendingProtocol {
    let protocolData = new ProtocolData(
        MARKET_ADDRESS,
        PROTOCOL_NAME,
        PROTOCOL_SLUG,
        SCHEMA_VERSION,
        SUBGRAPH_VERSION,
        METHODOLOGY_VERSION,
        Network.TESTCORE,
        LIQUIDATION_ADDRESS,
        PRICE_ORACLE1_ADDRESS

    );
    return _getOrCreateProtocol(protocolData);
}

export function _handleNewPriceOracle(
    protocol: LendingProtocol,
    newPriceOracle: string
  ): void {
    protocol._priceOracle = newPriceOracle;
    protocol.save();
  }