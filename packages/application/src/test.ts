import {getOperationContext} from '@monii/runtime/context'
import {log} from '@monii/runtime/log'



export async function main() {
    const context = getOperationContext()

    // context['user'] = {
    //     id: '123',
    //     name: 'John Doe',
    //     email: 'john.doe@example.com',
    // }
  log(context)
}
