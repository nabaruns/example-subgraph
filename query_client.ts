import { request, gql } from 'graphql-request'

const APIURL = 'http://localhost:8000/subgraphs/name/cosmos-validator-rewards'

const query = gql`
    query {
        rewards{
        validator,
        amount
        }
    }
`

request(APIURL, query)
    .then((data: any) => {
        console.log(data)
    })